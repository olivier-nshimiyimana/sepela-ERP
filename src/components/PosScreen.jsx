import { useCallback, useMemo, useRef, useState } from "react";
import { CreditCard, FileText, Search } from "lucide-react";
import BelowCostConfirmModal from "./BelowCostConfirmModal";
import CartDraftsModal from "./CartDraftsModal";
import CartTable from "./CartTable";
import ExpiryAlertsBanner from "./ExpiryAlertsBanner";
import LineDiscountModal from "./LineDiscountModal";
import PaymentModal from "./PaymentModal";
import ProductGrid from "./ProductGrid";
import { can, PERMISSIONS } from "../auth/permissions";
import { usePosKeyboard } from "../hooks/usePosKeyboard";
import { filterProductsBySearch } from "../utils/productSearch";
import DualCurrencyAmount from "./DualCurrencyAmount";
import { findBelowCostLineNames, normalizeCartDiscountFields } from "../utils/cartDiscount";
import { buildFefoCatalog, buildFefoCartLine } from "../utils/fefo";
import { useLocale } from "../contexts/LocaleContext";

const Box = "d" + "iv";

export default function PosScreen({
  user,
  merchantCode,
  sessionSalesUSD = 0,
  products,
  customers,
  exchangeRate,
  primaryCurrency,
  expiryAlertDays,
  cart,
  totalUSD,
  grossTotalUSD,
  manualDiscountUSD,
  upsertLine,
  replaceCart,
  removeLine,
  clearCart,
  onPaymentComplete,
  invoiceProfile,
  onOpenInvoice,
  onProforma,
  onOpenProducts,
  promotions = [],
  evaluateCartPromotions,
}) {
  const { t, tError } = useLocale();
  const [searchTerm, setSearchTerm] = useState("");
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isDraftsOpen, setIsDraftsOpen] = useState(false);
  const [discountLine, setDiscountLine] = useState(null);
  const [belowCostPending, setBelowCostPending] = useState(null);
  const searchRef = useRef(null);

  const showExpiryAlerts = can(user.role, PERMISSIONS.MANAGE_PRODUCTS);
  const canApplyCartDiscount = can(user.role, PERMISSIONS.APPLY_CART_DISCOUNT);
  const catalogProducts = useMemo(
    () => buildFefoCatalog(products, cart, expiryAlertDays),
    [products, cart, expiryAlertDays]
  );
  const cartProductIds = useMemo(() => new Set(cart.map((line) => line.id)), [cart]);

  const handleAdd = (product) => {
    const existing = cart.find((item) => item.id === product.id);
    const result = buildFefoCartLine({
      products,
      cart,
      reference: existing ?? product,
      qty: (existing?.qty ?? 0) + 1,
      alertDays: expiryAlertDays,
      excludeLineId: existing?.id ?? null,
    });
    if (!result.ok) {
      alert(tError(result.error));
      return;
    }
    upsertLine(result.line);
  };

  const handleIncrement = (id) => {
    const line = cart.find((i) => i.id === id);
    if (!line) return;
    const result = buildFefoCartLine({
      products,
      cart,
      reference: line,
      qty: line.qty + 1,
      alertDays: expiryAlertDays,
      excludeLineId: line.id,
    });
    if (!result.ok) {
      alert(tError(result.error));
      return;
    }
    upsertLine(result.line);
  };

  const handleDecrement = (id) => {
    const line = cart.find((item) => item.id === id);
    if (!line) return;
    if (line.qty <= 1) {
      removeLine(id);
      return;
    }
    const result = buildFefoCartLine({
      products,
      cart,
      reference: line,
      qty: line.qty - 1,
      alertDays: expiryAlertDays,
      excludeLineId: line.id,
    });
    if (!result.ok) {
      alert(tError(result.error));
      return;
    }
    upsertLine(result.line);
  };

  const handleSetQty = (id, rawQty) => {
    const line = cart.find((item) => item.id === id);
    const parsed = parseInt(rawQty, 10);

    if (!line || rawQty === "" || Number.isNaN(parsed) || parsed <= 0) {
      removeLine(id);
      return;
    }

    const result = buildFefoCartLine({
      products,
      cart,
      reference: line,
      qty: parsed,
      alertDays: expiryAlertDays,
      excludeLineId: line.id,
    });
    if (!result.ok) {
      alert(tError(result.error));
      if (result.available > 0) {
        const fallback = buildFefoCartLine({
          products,
          cart,
          reference: line,
          qty: result.available,
          alertDays: expiryAlertDays,
          excludeLineId: line.id,
        });
        if (fallback.ok) upsertLine(fallback.line);
      } else {
        removeLine(id);
      }
      return;
    }

    upsertLine(result.line);
  };

  const handleLoadDraft = (draftCart) => {
    if (cart.length > 0 && !window.confirm(t("pos.replaceDraftConfirm"))) {
      return;
    }
    replaceCart(draftCart);
  };

  const applyLineDiscount = (lineId, discountData) => {
    const line = cart.find((row) => row.id === lineId);
    if (!line) return;
    const next = { ...line, ...normalizeCartDiscountFields({ ...line, ...discountData }) };
    const belowCost = findBelowCostLineNames([next], products);
    if (belowCost.length > 0) {
      setBelowCostPending({ kind: "line", lineId, discountData, names: belowCost });
      return;
    }
    upsertLine(next);
    setDiscountLine(null);
  };

  const confirmBelowCost = () => {
    if (!belowCostPending) return;
    if (belowCostPending.kind === "line") {
      const line = cart.find((row) => row.id === belowCostPending.lineId);
      if (line) {
        upsertLine({
          ...line,
          ...normalizeCartDiscountFields({ ...line, ...belowCostPending.discountData }),
        });
      }
      setDiscountLine(null);
    } else if (belowCostPending.kind === "payment") {
      setIsPaymentOpen(true);
    }
    setBelowCostPending(null);
  };

  const openPayment = useCallback(() => {
    const refreshed = [];
    for (const line of cart) {
      const result = buildFefoCartLine({
        products,
        cart,
        reference: line,
        qty: line.qty,
        alertDays: expiryAlertDays,
        excludeLineId: line.id,
      });
      if (!result.ok) {
        alert(tError(result.error));
        return;
      }
      refreshed.push(result.line);
    }
    replaceCart(refreshed);

    const promoResult = evaluateCartPromotions
      ? evaluateCartPromotions({ cart: refreshed, products, promotions, customer: null })
      : { totalDiscountUSD: 0 };
    const belowCost = findBelowCostLineNames(refreshed, products, {
      promotionDiscountUSD: promoResult.totalDiscountUSD ?? 0,
    });
    if (belowCost.length > 0) {
      setBelowCostPending({ kind: "payment", names: belowCost });
      return;
    }
    setIsPaymentOpen(true);
  }, [cart, products, expiryAlertDays, promotions, evaluateCartPromotions, replaceCart, tError]);

  usePosKeyboard({
    enabled: !isPaymentOpen,
    cartLength: cart.length,
    onFocusSearch: () => searchRef.current?.focus(),
    onOpenPayment: openPayment,
  });

  const handleSearchKeyDown = (e) => {
    if (e.key !== "Enter") return;
    const matches = filterProductsBySearch(catalogProducts, searchTerm).filter((p) => p.stock > 0);
    if (matches.length >= 1) {
      e.preventDefault();
      handleAdd(matches[0]);
      setSearchTerm("");
      return;
    }
    if (cart.length > 0) {
      e.preventDefault();
      openPayment();
    }
  };

  return (
    <>
      <Box className="flex flex-1 overflow-hidden relative">
        {showExpiryAlerts && (
          <ExpiryAlertsBanner
            products={products}
            expiryAlertDays={expiryAlertDays}
            onManageProducts={onOpenProducts}
          />
        )}
        <section className="flex-1 flex flex-col bg-sepela-bg">
          <Box className="px-4 py-3 bg-sepela-toolbar flex gap-2">
            <Box className="relative flex-1">
              <Search className="absolute left-3 top-3 text-sepela-muted" size={20} />
              <input
                ref={searchRef}
                type="text"
                placeholder={t("pos.searchPlaceholder")}
                className="pos-search w-full py-3 pl-11 pr-4 text-white placeholder:text-sepela-muted"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                aria-keyshortcuts="F3 F4 Enter"
              />
            </Box>
          </Box>

          <Box className="flex-1 overflow-auto p-4">
            <CartTable
              cart={cart}
              exchangeRate={exchangeRate}
              primaryCurrency={primaryCurrency}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
              onSetQty={handleSetQty}
              onRemove={removeLine}
              onDiscount={canApplyCartDiscount ? setDiscountLine : undefined}
              showDiscount={canApplyCartDiscount}
            />
          </Box>
        </section>

        <aside className="w-[22rem] bg-sepela-toolbar flex flex-col p-2.5 shadow-[inset_1px_0_0_#383838]">
          <Box className="flex-1 overflow-auto mb-4 min-h-0">
            <ProductGrid
              products={catalogProducts}
              searchTerm={searchTerm}
              exchangeRate={exchangeRate}
              primaryCurrency={primaryCurrency}
              expiryAlertDays={expiryAlertDays}
              cartProductIds={cartProductIds}
              onAdd={handleAdd}
            />
          </Box>

          <Box className="mt-auto grid gap-2.5 shrink-0 p-1">
            <button
              type="button"
              onClick={onProforma}
              disabled={cart.length === 0}
              className="pos-side-btn"
            >
              {t("pos.proforma")}
            </button>
            <button
              type="button"
              onClick={() => setIsDraftsOpen(true)}
              className="pos-side-btn"
            >
              <FileText size={16} />
              {t("pos.drafts")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (cart.length === 0 || window.confirm(t("pos.clearSaleConfirm"))) {
                  clearCart();
                }
              }}
              className="pos-side-btn pos-side-btn--danger"
            >
              {t("pos.clearSale")}
            </button>
            <button
              type="button"
              onClick={openPayment}
              disabled={cart.length === 0}
              title={`${t("pos.payment")} (F4)`}
              className="pos-pay-btn flex flex-col items-center justify-center active:scale-[0.98] transition-all"
            >
              <CreditCard size={34} />
              <span className="pos-pay-btn__label">{t("pos.payment")}</span>
              <span className="pos-pay-btn__hint">{t("pos.paymentHint")}</span>
            </button>
          </Box>
        </aside>
      </Box>

      <footer className="bg-sepela-bg px-5 py-4 shadow-[inset_0_1px_0_#383838] flex justify-between items-end gap-6 shrink-0">
        <Box>
          <p className="pos-footer-label">{t("pos.currentSale")}</p>
          <DualCurrencyAmount
            amountUsd={totalUSD}
            exchangeRate={exchangeRate}
            primaryCurrency={primaryCurrency}
            size="xl"
            primaryClassName="text-white"
          />
        </Box>
        <Box className="text-center hidden sm:block">
          <p className="pos-footer-label">
            {t("pos.sessionSales")} · {t("pos.sessionSalesHint")}
          </p>
          <DualCurrencyAmount
            amountUsd={sessionSalesUSD}
            exchangeRate={exchangeRate}
            primaryCurrency={primaryCurrency}
            size="lg"
            align="center"
            primaryClassName="text-sepela-muted"
          />
        </Box>
        <Box className="text-right sm:hidden">
          <p className="pos-footer-label">{t("pos.sessionSales")}</p>
          <DualCurrencyAmount
            amountUsd={sessionSalesUSD}
            exchangeRate={exchangeRate}
            primaryCurrency={primaryCurrency}
            size="sm"
            align="right"
            primaryClassName="text-amber-400"
          />
        </Box>
      </footer>

      <CartDraftsModal
        isOpen={isDraftsOpen}
        merchantCode={merchantCode}
        operatorId={user?.id}
        operatorName={user?.displayName}
        cart={cart}
        onClose={() => setIsDraftsOpen(false)}
        onLoadDraft={handleLoadDraft}
      />

      {canApplyCartDiscount ? (
        <LineDiscountModal
          isOpen={!!discountLine}
          line={discountLine}
          onClose={() => setDiscountLine(null)}
          onApply={applyLineDiscount}
        />
      ) : null}

      <BelowCostConfirmModal
        isOpen={!!belowCostPending}
        itemNames={belowCostPending?.names ?? []}
        onConfirm={confirmBelowCost}
        onCancel={() => setBelowCostPending(null)}
      />

      <PaymentModal
        isOpen={isPaymentOpen}
        customers={customers}
        cart={cart}
        products={products}
        promotions={promotions}
        evaluateCartPromotions={evaluateCartPromotions}
        totalUSD={totalUSD}
        grossTotalUSD={grossTotalUSD}
        manualDiscountUSD={manualDiscountUSD}
        exchangeRate={exchangeRate}
        primaryCurrency={primaryCurrency}
        invoiceProfile={invoiceProfile}
        onOpenInvoice={onOpenInvoice}
        onClose={() => setIsPaymentOpen(false)}
        onComplete={async (summary, options) => {
          const result = await onPaymentComplete(summary, cart, options);
          if (options?.recordOnly) {
            return result;
          }
          if (result !== false) {
            setIsPaymentOpen(false);
          }
          return result;
        }}
      />
    </>
  );
}
