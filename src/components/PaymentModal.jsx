import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import ChangeCalculator from "./ChangeCalculator";
import { getPaymentMethod, PAYMENT_METHODS } from "../data/paymentMethods";
import { computeCashPaymentInPrimary } from "../utils/changeCalculator";
import {
  CURRENCY,
  cashReceivedToUsd,
  formatDualCurrency,
  normalizePrimaryCurrency,
  roundUsd,
  usdToCdf,
} from "../utils/currency";
import { roundCdf } from "../utils/moneyRounding";
import { findMatchingCustomer, sortCustomers } from "../utils/customers";
import { useLocale } from "../contexts/LocaleContext";
import { useCurrency } from "../contexts/CurrencyContext";
import { paymentMethodLabel } from "../i18n";
import { findBelowCostLineNames } from "../utils/cartDiscount";
import {
  appliedPromotionLabels,
  findCheckoutPromotionHint,
  findTierQuickPickCustomers,
  promotionQualifyingSubtotalUsd,
} from "../utils/promotionEngine";
import BelowCostConfirmModal from "./BelowCostConfirmModal";
import SaleCompleteActions from "./SaleCompleteActions";
import SepelaModal from "./SepelaModal";
import { useNotification } from "../contexts/NotificationContext";
import { useDatabase } from "../contexts/DatabaseContext";
import {
  emailInvoice,
  formatInvoiceActionError,
  printReceiptText,
  saveInvoicePdfFile,
} from "../utils/invoiceActions";

const EPSILON = 0.001;
const Box = "d" + "iv";

const MIN_MOBILE_REF_LENGTH = 6;

function isEditableField(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
}

export default function PaymentModal({
  isOpen,
  customers = [],
  cart = [],
  products = [],
  promotions = [],
  evaluateCartPromotions,
  totalUSD,
  grossTotalUSD,
  manualDiscountUSD = 0,
  exchangeRate,
  primaryCurrency,
  invoiceProfile,
  onOpenInvoice,
  onClose,
  onComplete,
}) {
  const { t, locale } = useLocale();
  const currency = useCurrency();
  const { notifySuccess, notifyError } = useNotification();
  const { updateSaleNotes } = useDatabase();
  const primary = normalizePrimaryCurrency(primaryCurrency);
  const [method, setMethod] = useState("cash");
  const [amountReceived, setAmountReceived] = useState("");
  const [reference, setReference] = useState("");
  const [cardLastFour, setCardLastFour] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerTaxNumber, setCustomerTaxNumber] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [shouldSaveCustomer, setShouldSaveCustomer] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completedSummary, setCompletedSummary] = useState(null);
  const [belowCostNames, setBelowCostNames] = useState(null);
  const [recordedSale, setRecordedSale] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const validateBtnRef = useRef(null);
  const doneBtnRef = useRef(null);

  const methodMeta = getPaymentMethod(method);
  const savedCustomers = useMemo(() => sortCustomers(customers), [customers]);

  useEffect(() => {
    if (!isOpen) {
      setMethod("cash");
      setAmountReceived("");
      setReference("");
      setCardLastFour("");
      setCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      setCustomerTaxNumber("");
      setCustomerAddress("");
      setCustomerEmail("");
      setShouldSaveCustomer(false);
      setCompleted(false);
      setCompletedSummary(null);
      setBelowCostNames(null);
      setRecordedSale(null);
      setRecording(false);
      setRecordError("");
      setActionBusy("");
    }
  }, [isOpen]);

  const receivedRaw = parseFloat(amountReceived) || 0;
  const isValidCashAmount = !Number.isNaN(receivedRaw) && receivedRaw >= 0;
  const receivedUsd = cashReceivedToUsd(receivedRaw, exchangeRate, primary);

  const mobileRefOk = reference.trim().length >= MIN_MOBILE_REF_LENGTH;
  const cardLastFourOk =
    cardLastFour === "" || /^\d{4}$/.test(cardLastFour.trim());
  const hasAnyClientInput =
    customerName.trim().length > 0 ||
    customerPhone.trim().length > 0 ||
    customerTaxNumber.trim().length > 0 ||
    customerAddress.trim().length > 0 ||
    customerEmail.trim().length > 0;
  const isWalkInClient = !hasAnyClientInput;
  const showClientDetails = !isWalkInClient;

  const selectedCustomer = useMemo(() => {
    if (isWalkInClient) return null;
    if (customerId) {
      const saved = savedCustomers.find((c) => c.id === customerId);
      if (saved) return saved;
    }
    return {
      id: customerId || null,
      name: customerName.trim(),
      clientTier: null,
    };
  }, [customerId, customerName, isWalkInClient, savedCustomers]);

  /** Tier promos use the saved client record only — no manual tier entry at checkout. */
  const customerForPromotions = useMemo(() => {
    if (isWalkInClient) return null;
    if (customerId) {
      return savedCustomers.find((c) => c.id === customerId) ?? null;
    }
    const matched = findMatchingCustomer(savedCustomers, { name: customerName });
    return matched ?? null;
  }, [customerId, customerName, isWalkInClient, savedCustomers]);

  const promotionResult = useMemo(() => {
    const subtotal = totalUSD;
    if (!evaluateCartPromotions || cart.length === 0) {
      return {
        cartSubtotalUSD: subtotal,
        totalDiscountUSD: 0,
        totalAfterDiscountUSD: subtotal,
        appliedPromotionIds: [],
      };
    }
    return evaluateCartPromotions({
      cart,
      products,
      promotions,
      customer: customerForPromotions,
    });
  }, [cart, products, promotions, customerForPromotions, totalUSD, evaluateCartPromotions]);

  const payableUSD = roundUsd(promotionResult.totalAfterDiscountUSD);
  const discountUSD = roundUsd(promotionResult.totalDiscountUSD);

  const appliedPromoNames = useMemo(
    () => appliedPromotionLabels(promotions, promotionResult.appliedPromotionIds),
    [promotions, promotionResult.appliedPromotionIds]
  );

  const promotionHint = useMemo(() => {
    if (promotionResult.totalDiscountUSD > 0 || !promotions?.length || cart.length === 0) return null;
    return findCheckoutPromotionHint({
      promotions,
      cart,
      products,
      customer: customerForPromotions,
      cartSubtotalUsd: totalUSD,
    });
  }, [promotions, cart, products, customerForPromotions, totalUSD, promotionResult.totalDiscountUSD]);

  const tierQuickPickCustomers = useMemo(
    () =>
      findTierQuickPickCustomers({
        promotions,
        cart,
        products,
        customers: savedCustomers,
        customer: customerForPromotions,
        cartSubtotalUsd: totalUSD,
      }),
    [promotions, cart, products, savedCustomers, customerForPromotions, totalUSD]
  );
  const grossSubtotalUSD = grossTotalUSD ?? totalUSD + manualDiscountUSD;
  const totalCDF = usdToCdf(payableUSD, exchangeRate);
  const totalDual = formatDualCurrency(payableUSD, exchangeRate, primary);
  const grossSubtotalDual = formatDualCurrency(grossSubtotalUSD, exchangeRate, primary);
  const manualDiscountDual = formatDualCurrency(manualDiscountUSD, exchangeRate, primary);
  const discountDual = formatDualCurrency(discountUSD, exchangeRate, primary);
  const showTotalsBreakdown = manualDiscountUSD > 0.001 || discountUSD > 0.001;

  const customerInfoOk =
    isWalkInClient ||
    (customerName.trim().length > 0 &&
      customerPhone.trim().length > 0 &&
      customerTaxNumber.trim().length > 0 &&
      (customerEmail.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())));
  const visibleSavedCustomers = useMemo(() => {
    const term = customerName.trim().toLowerCase();
    const filtered = !term
      ? savedCustomers
      : savedCustomers.filter((customer) =>
          [
            customer.name,
            customer.phone,
            customer.taxNumber,
            customer.email,
          ]
            .map((value) => String(value ?? "").toLowerCase())
            .some((value) => value.includes(term))
        );
    return filtered.slice(0, 8);
  }, [customerName, savedCustomers]);

  const cashPayment = computeCashPaymentInPrimary(
    amountReceived,
    payableUSD,
    exchangeRate,
    primary
  );
  const {
    canPay: cashCanPayDiscounted,
    changeDueUSD: changeDueDiscounted,
    shortfallUSD: shortfallDiscounted,
    changePrimary: changePrimaryDiscounted,
    changeDueCDF: changeDueCdfDiscounted,
  } = cashPayment;
  const cashCanPayValidDiscounted =
    payableUSD > 0 && isValidCashAmount && cashCanPayDiscounted;

  const canValidate =
    payableUSD > 0 &&
    customerInfoOk &&
    ((method === "cash" && cashCanPayValidDiscounted) ||
      (method === "mobile_money" && mobileRefOk) ||
      (method === "card" && cardLastFourOk));

  const switchMethod = (nextMethod) => {
    setMethod(nextMethod);
    setAmountReceived("");
    setReference("");
    setCardLastFour("");
  };

  const applyCustomer = useCallback((customer) => {
    setCustomerId(customer?.id ?? "");
    setCustomerName(customer?.name ?? "");
    setCustomerPhone(customer?.phone ?? "");
    setCustomerTaxNumber(customer?.taxNumber ?? "");
    setCustomerAddress(customer?.address ?? "");
    setCustomerEmail(customer?.email ?? "");
    setShouldSaveCustomer(false);
  }, []);

  const useWalkInClient = useCallback(() => {
    setCustomerId("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerTaxNumber("");
    setCustomerAddress("");
    setCustomerEmail("");
    setShouldSaveCustomer(false);
  }, []);

  const handleCustomerNameChange = useCallback(
    (value) => {
      setCustomerName(value);
      const matched = findMatchingCustomer(savedCustomers, { name: value });
      if (matched) {
        applyCustomer(matched);
        return;
      }
      if (customerId) {
        setCustomerPhone("");
        setCustomerTaxNumber("");
        setCustomerAddress("");
        setCustomerEmail("");
      }
      setCustomerId("");
      setShouldSaveCustomer(value.trim().length > 0);
    },
    [applyCustomer, customerId, savedCustomers]
  );

  const buildCompletedSummary = useCallback(() => ({
      method,
      methodLabel: paymentMethodLabel(method, locale),
      cartSubtotalUSD: totalUSD,
      grossSubtotalUSD,
      manualDiscountUSD,
      promotionDiscountUSD: discountUSD,
      appliedPromotionId: promotionResult.appliedPromotionIds[0] ?? null,
      totalUSD: payableUSD,
      totalCDF,
      changeDueUSD: method === "cash" ? roundUsd(changeDueDiscounted) : 0,
      changePrimary: method === "cash" ? changePrimaryDiscounted : 0,
      changeDueCDF:
        method === "cash" && primary === CURRENCY.CDF ? roundCdf(changeDueCdfDiscounted) : 0,
      amountReceived: method === "cash" ? roundUsd(receivedUsd) : payableUSD,
      amountReceivedPrimary:
        method === "cash" && primary === CURRENCY.CDF ? roundCdf(receivedRaw) : null,
      reference: method === "mobile_money" ? reference.trim() : undefined,
      cardLastFour: method === "card" && cardLastFour ? cardLastFour.trim() : undefined,
      customerId: isWalkInClient ? undefined : customerId || undefined,
      customerName: isWalkInClient ? undefined : customerName.trim() || undefined,
      customerPhone: isWalkInClient ? undefined : customerPhone.trim() || undefined,
      customerTaxNumber: isWalkInClient ? undefined : customerTaxNumber.trim() || undefined,
      customerAddress: isWalkInClient ? undefined : customerAddress.trim() || undefined,
      customerEmail: isWalkInClient ? undefined : customerEmail.trim() || undefined,
      saveCustomer:
        !isWalkInClient && !!customerName.trim() && (!!customerId || shouldSaveCustomer),
  }), [
    method,
    locale,
    payableUSD,
    totalCDF,
    changeDueDiscounted,
    changePrimaryDiscounted,
    changeDueCdfDiscounted,
    receivedRaw,
    primary,
    receivedUsd,
    discountUSD,
    promotionResult,
    totalUSD,
    grossSubtotalUSD,
    manualDiscountUSD,
    reference,
    cardLastFour,
    customerId,
    customerName,
    customerPhone,
    customerTaxNumber,
    customerAddress,
    customerEmail,
    isWalkInClient,
    shouldSaveCustomer,
  ]);

  const finalizeSale = useCallback(async () => {
    const summary = buildCompletedSummary();
    setRecording(true);
    setRecordError("");
    try {
      const sale = await onComplete(summary, { recordOnly: true });
      if (!sale || sale.ok === false) {
        setRecordError(sale?.error ?? t("payment.recordFailed"));
        return;
      }
      setRecordedSale(sale);
      setCompletedSummary(summary);
      setCompleted(true);
    } catch (error) {
      setRecordError(String(error?.message ?? error ?? t("payment.recordFailed")));
    } finally {
      setRecording(false);
    }
  }, [buildCompletedSummary, onComplete, t]);

  const invoiceActionContext = useMemo(
    () => ({
      primaryCurrency: primary,
      exchangeRate,
      locale,
      promotions,
    }),
    [primary, exchangeRate, locale, promotions]
  );

  const runInvoiceAction = useCallback(
    async (actionId, fn) => {
      if (!recordedSale || !invoiceProfile) return;
      setActionBusy(actionId);
      try {
        await fn();
      } catch (error) {
        console.error(error);
        const formatted = formatInvoiceActionError(error);
        notifyError(t(formatted.key, formatted.params));
      } finally {
        setActionBusy("");
      }
    },
    [recordedSale, invoiceProfile, notifyError, t]
  );

  const handlePrintReceipt = useCallback(() => {
    runInvoiceAction("receipt", async () => {
      printReceiptText(recordedSale, invoiceProfile, invoiceActionContext);
    });
  }, [runInvoiceAction, recordedSale, invoiceProfile, invoiceActionContext]);

  const handlePrintInvoice = useCallback(() => {
    if (!recordedSale) return;
    onOpenInvoice?.(recordedSale);
  }, [recordedSale, onOpenInvoice]);

  const handleEmailInvoice = useCallback(() => {
    runInvoiceAction("email", async () => {
      const result = await emailInvoice(recordedSale, invoiceProfile, {
        ...invoiceActionContext,
        formatId: invoiceProfile?.defaultPrintFormat || "A4",
      });
      if (result.cancelled) {
        notifyError(t("notification.emailCancelled"));
        return;
      }
      if (result.pdfPath) {
        notifySuccess(t("notification.emailOpened", { path: result.pdfPath }));
      } else {
        notifySuccess(t("notification.emailOpenedSimple"));
      }
    });
  }, [
    runInvoiceAction,
    recordedSale,
    invoiceProfile,
    invoiceActionContext,
    notifySuccess,
    t,
  ]);

  const handleSavePdf = useCallback(() => {
    runInvoiceAction("pdf", async () => {
      const savedPath = await saveInvoicePdfFile(recordedSale, invoiceProfile, {
        ...invoiceActionContext,
        formatId: invoiceProfile?.defaultPrintFormat || "A4",
        dialogTitle: t("notification.invoicePdfSaveTitle"),
      });
      if (!savedPath) return;
      notifySuccess(t("notification.documentSaved", { path: savedPath }));
    });
  }, [runInvoiceAction, recordedSale, invoiceProfile, invoiceActionContext, notifySuccess, t]);

  const handleSaveNotes = useCallback(
    async (notes) => {
      if (!recordedSale?.id || !updateSaleNotes) return;
      const updated = await updateSaleNotes(recordedSale.id, notes);
      if (updated) {
        setRecordedSale(updated);
        notifySuccess(t("payment.saleNotesSaved"));
      }
    },
    [recordedSale, updateSaleNotes, notifySuccess, t]
  );

  const handleComplete = useCallback(() => {
    if (!canValidate) return;

    const belowCost = findBelowCostLineNames(cart, products, {
      promotionDiscountUSD: discountUSD,
      cartNetSubtotal: totalUSD,
    });
    if (belowCost.length > 0) {
      setBelowCostNames(belowCost);
      return;
    }

    void finalizeSale();
  }, [canValidate, cart, products, discountUSD, totalUSD, finalizeSale]);

  const handleDone = useCallback(() => {
    onComplete(completedSummary ?? buildCompletedSummary(), { done: true });
  }, [completedSummary, buildCompletedSummary, onComplete]);

  const handleClose = useCallback(() => {
    if (completed && recordedSale) {
      handleDone();
      return;
    }
    onClose();
  }, [completed, recordedSale, handleDone, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      if (completed && completedSummary) {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          handleDone();
        } else if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          handlePrintInvoice();
        } else if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          handlePrintReceipt();
        } else if (e.key === "e" || e.key === "E") {
          e.preventDefault();
          handleEmailInvoice();
        } else if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          handleSavePdf();
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      const inField = isEditableField(e.target);

      if (!inField && e.key === "1") {
        e.preventDefault();
        switchMethod("cash");
        return;
      }
      if (!inField && e.key === "2") {
        e.preventDefault();
        switchMethod("mobile_money");
        return;
      }
      if (!inField && e.key === "3") {
        e.preventDefault();
        switchMethod("card");
        return;
      }

      if (!inField && e.key === "Enter" && canValidate) {
        e.preventDefault();
        handleComplete();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isOpen,
    completed,
    completedSummary,
    canValidate,
    handleComplete,
    handleDone,
    handlePrintInvoice,
    handlePrintReceipt,
    handleEmailInvoice,
    handleSavePdf,
    onClose,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      if (completed) doneBtnRef.current?.focus();
      else validateBtnRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [isOpen, completed, method]);

  if (!isOpen) return null;

  const PaymentIcon = completed ? CheckCircle2 : methodMeta.icon;

  return (
    <>
    <SepelaModal
      isOpen={isOpen}
      onClose={handleClose}
      title={completed ? t("payment.saleComplete") : t("payment.completeTransaction")}
      icon={PaymentIcon}
      portal
      fullscreen
      zClass="z-[60]"
      className="sepela-modal--pay"
      bodyClassName=""
    >
      <Box className="sepela-modal-body flex-1 min-h-0">
        {completed && completedSummary ? (
          <SaleCompleteActions
            sale={recordedSale}
            summary={completedSummary}
            exchangeRate={exchangeRate}
            primaryCurrency={primary}
            recording={recording}
            recordError={recordError}
            actionBusy={actionBusy}
            onPrintReceipt={handlePrintReceipt}
            onPrintInvoice={handlePrintInvoice}
            onEmail={handleEmailInvoice}
            onSavePdf={handleSavePdf}
            onSaveNotes={handleSaveNotes}
            onDone={handleDone}
            doneBtnRef={doneBtnRef}
          />
        ) : (
          <Box className="sepela-checkout">
            <Box className="sepela-checkout__header">
              <Box className="sepela-checkout__total">
                <span className="sepela-checkout__total-label">{t("payment.total")}</span>
                <span className="sepela-checkout__total-value">{totalDual.primary}</span>
                <span className="sepela-checkout__total-secondary">≈ {totalDual.secondary}</span>
              </Box>

              {showTotalsBreakdown ? (
                <Box className="sepela-checkout__breakdown">
                  <Box className="sepela-pay-breakdown__row sepela-text-muted">
                    <span>{t("payment.subtotal")}</span>
                    <span>{grossSubtotalDual.primary}</span>
                  </Box>
                  {manualDiscountUSD > 0.001 ? (
                    <Box className="sepela-pay-breakdown__row text-amber-400">
                      <span>{t("payment.manualDiscount")}</span>
                      <span>-{manualDiscountDual.primary}</span>
                    </Box>
                  ) : null}
                  {discountUSD > 0.001 ? (
                    <Box className="sepela-pay-breakdown__row text-amber-400">
                      <span className="truncate">
                        {t("payment.promotionDiscount")}
                        {appliedPromoNames.length > 0 ? ` · ${appliedPromoNames[0]}` : ""}
                      </span>
                      <span className="shrink-0">-{discountDual.primary}</span>
                    </Box>
                  ) : null}
                </Box>
              ) : null}

              {tierQuickPickCustomers.length > 0 ? (
                <Box className="sepela-checkout__promo">
                  {t("payment.promoQuickPickTitle")}:{" "}
                  {tierQuickPickCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => applyCustomer(customer)}
                      className="sepela-link-btn ml-1"
                    >
                      {customer.name}
                    </button>
                  ))}
                </Box>
              ) : null}

              {promotionHint &&
              (promotionHint.reason !== "tier" || tierQuickPickCustomers.length === 0) ? (
                <Box className="sepela-checkout__promo">
                  {promotionHint.reason === "tier"
                    ? t("payment.promoNeedsSavedClient", {
                        name: promotionHint.promotion.name,
                        tier: promotionHint.promotion.clientTier,
                      })
                    : promotionHint.reason === "not_live"
                      ? t("payment.promoNotLive", { name: promotionHint.promotion.name })
                      : promotionHint.reason === "min_order"
                        ? t("payment.promoMinOrder", {
                            name: promotionHint.promotion.name,
                            amount: currency.formatPrimary(
                              (() => {
                                const minUsd = Number(promotionHint.promotion.minOrderAmount);
                                const scope = promotionHint.promotion.targetScope;
                                const basisUsd =
                                  scope === "specific_product" || scope === "specific_category"
                                    ? promotionQualifyingSubtotalUsd(
                                        promotionHint.promotion,
                                        cart,
                                        products
                                      )
                                    : totalUSD;
                                return Math.max(0, minUsd - basisUsd) || minUsd;
                              })()
                            ),
                          })
                        : t("payment.promoNoProduct", { name: promotionHint.promotion.name })}
                </Box>
              ) : null}
            </Box>

            <Box className="sepela-checkout__body">
              <Box className="sepela-checkout__section sepela-checkout__section--client">
                <Box className="sepela-checkout__section-head">
                  <p className="sepela-label">{t("common.client")}</p>
                  <span className="sepela-checkout__meta">
                    {t("payment.savedCount", { count: savedCustomers.length })}
                  </span>
                </Box>

                <Box className="sepela-checkout__client-toolbar">
                  <button
                    type="button"
                    onClick={useWalkInClient}
                    className={`sepela-checkout__walkin ${
                      isWalkInClient ? "sepela-checkout__walkin--active" : ""
                    }`}
                  >
                    {t("payment.walkIn")}
                  </button>
                  <input
                    list="saved-clients"
                    type="text"
                    placeholder={t("payment.clientNamePlaceholder")}
                    className="sepela-input sepela-checkout__client-search"
                    value={customerName}
                    onChange={(e) => handleCustomerNameChange(e.target.value)}
                  />
                  <datalist id="saved-clients">
                    {savedCustomers.map((customer) => (
                      <option
                        key={customer.id}
                        value={customer.name}
                        label={customer.phone ?? customer.taxNumber ?? customer.name}
                      />
                    ))}
                  </datalist>
                </Box>

                {visibleSavedCustomers.length > 0 ? (
                  <Box className="sepela-checkout__chips">
                    {visibleSavedCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => applyCustomer(customer)}
                        className={`sepela-checkout__chip ${
                          customerId === customer.id ? "sepela-checkout__chip--active" : ""
                        }`}
                      >
                        {customer.name}
                      </button>
                    ))}
                  </Box>
                ) : null}

                {showClientDetails ? (
                  <Box className="sepela-checkout__client-form">
                    <Box>
                      <label className="sepela-label">{t("common.phone")}</label>
                      <input
                        type="text"
                        inputMode="tel"
                        className="sepela-input"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                      />
                    </Box>
                    <Box>
                      <label className="sepela-label">{t("payment.taxNumber")}</label>
                      <input
                        type="text"
                        className="sepela-input"
                        value={customerTaxNumber}
                        onChange={(e) => setCustomerTaxNumber(e.target.value)}
                      />
                    </Box>
                    <Box className="sepela-checkout__field-span">
                      <label className="sepela-label">{t("common.address")}</label>
                      <input
                        type="text"
                        className="sepela-input"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                      />
                    </Box>
                    <Box className="sepela-checkout__field-span">
                      <label className="sepela-label">{t("common.email")}</label>
                      <input
                        type="email"
                        className="sepela-input"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                      />
                    </Box>
                  </Box>
                ) : (
                  <p className="sepela-checkout__hint">{t("payment.walkInNotSaved")}</p>
                )}

                {showClientDetails && !customerInfoOk && (
                  <p className="sepela-checkout__warn">{t("payment.clientInvoiceHint")}</p>
                )}
                {showClientDetails ? (
                  <label className="sepela-checkout__save">
                    <input
                      type="checkbox"
                      className="sepela-checkbox"
                      checked={!!customerName.trim() && (!!customerId || shouldSaveCustomer)}
                      onChange={(e) => setShouldSaveCustomer(e.target.checked)}
                      disabled={!customerName.trim() || !!customerId}
                    />
                    {customerId ? t("payment.savedClientSelected") : t("payment.saveClientNext")}
                  </label>
                ) : null}
              </Box>

              <Box className="sepela-checkout__section sepela-checkout__section--payment">
                <p className="sepela-label">{t("payment.paymentMethod")}</p>
                <Box className="sepela-checkout__methods" role="tablist">
                  {PAYMENT_METHODS.map((m, idx) => {
                    const Icon = m.icon;
                    const active = method === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => switchMethod(m.id)}
                        title={`${paymentMethodLabel(m.id, locale)} (${idx + 1})`}
                        className={`sepela-checkout__method ${
                          active ? "sepela-checkout__method--active" : ""
                        }`}
                      >
                        <Icon size={16} />
                        <span>{paymentMethodLabel(m.id, locale)}</span>
                      </button>
                    );
                  })}
                </Box>

                {method === "cash" && (
                  <Box className="sepela-checkout__cash">
                    <label className="sepela-label" htmlFor="pay-amount-received">
                      {t("payment.amountReceived", { currency: primary })}
                    </label>
                    <input
                      id="pay-amount-received"
                      autoFocus
                      type="number"
                      min="0"
                      step={primary === CURRENCY.CDF ? "1" : "0.01"}
                      placeholder={primary === CURRENCY.CDF ? "0" : "0.00"}
                      className={`sepela-input sepela-input-lg sepela-money sepela-checkout__amount ${
                        shortfallDiscounted > EPSILON && amountReceived !== ""
                          ? "sepela-input--error"
                          : ""
                      }`}
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canValidate) {
                          e.preventDefault();
                          handleComplete();
                        }
                      }}
                    />
                    <ChangeCalculator
                      compact
                      totalUSD={payableUSD}
                      exchangeRate={exchangeRate}
                      primaryCurrency={primary}
                      amountReceived={amountReceived}
                      onAmountReceivedChange={setAmountReceived}
                    />
                  </Box>
                )}

                {method === "mobile_money" && (
                  <Box className="sepela-checkout__alt-pay">
                    <label className="sepela-label">{t("payment.transactionRef")}</label>
                    <input
                      autoFocus
                      type="text"
                      placeholder={t("payment.mobileRefPlaceholder")}
                      className="sepela-input font-mono"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canValidate) {
                          e.preventDefault();
                          handleComplete();
                        }
                      }}
                    />
                    <p className="sepela-checkout__hint">
                      {t("payment.mobileRefHint", { min: MIN_MOBILE_REF_LENGTH })}
                    </p>
                  </Box>
                )}

                {method === "card" && (
                  <Box className="sepela-checkout__alt-pay">
                    <label className="sepela-label">{t("payment.cardLastFour")}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="····"
                      className={`sepela-input sepela-input-lg text-center text-xl font-mono tracking-[0.5em] sepela-money ${
                        !cardLastFourOk ? "sepela-input--error" : ""
                      }`}
                      value={cardLastFour}
                      onChange={(e) =>
                        setCardLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canValidate) {
                          e.preventDefault();
                          handleComplete();
                        }
                      }}
                    />
                    <p className="sepela-checkout__hint">{t("payment.cardHint")}</p>
                  </Box>
                )}
              </Box>
            </Box>

            <Box className="sepela-checkout__footer">
              <button
                ref={validateBtnRef}
                type="button"
                disabled={!canValidate}
                onClick={handleComplete}
                className="sepela-btn-primary sepela-checkout__validate"
              >
                {t("payment.validateSale")}
              </button>
            </Box>
          </Box>
        )}
      </Box>
    </SepelaModal>

    <BelowCostConfirmModal
      isOpen={!!belowCostNames?.length}
      itemNames={belowCostNames ?? []}
      onConfirm={() => {
        setBelowCostNames(null);
        void finalizeSale();
      }}
      onCancel={() => setBelowCostNames(null)}
    />
    </>
  );
}
