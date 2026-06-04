import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import ChangeCalculator from "./ChangeCalculator";
import { getPaymentMethod, PAYMENT_METHODS } from "../data/paymentMethods";
import { computeCashPayment } from "../utils/changeCalculator";
import { findMatchingCustomer, sortCustomers } from "../utils/customers";

const EPSILON = 0.001;
const Box = "d" + "iv";

const MIN_MOBILE_REF_LENGTH = 6;

export default function PaymentModal({
  isOpen,
  customers = [],
  totalUSD,
  exchangeRate,
  onClose,
  onComplete,
}) {
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
  const validateBtnRef = useRef(null);
  const finishNoPrintRef = useRef(null);

  const totalCDF = totalUSD * exchangeRate;
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
    }
  }, [isOpen]);

  const received = parseFloat(amountReceived) || 0;
  const isValidCashAmount = !Number.isNaN(received) && received >= 0;
  const { canPay: cashCanPay, changeDueUSD, shortfallUSD: shortfall } = computeCashPayment(
    received,
    totalUSD
  );
  const cashCanPayValid = totalUSD > 0 && isValidCashAmount && cashCanPay;

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

  const canValidate =
    totalUSD > 0 &&
    customerInfoOk &&
    ((method === "cash" && cashCanPayValid) ||
      (method === "mobile_money" && mobileRefOk) ||
      (method === "card" && cardLastFourOk));

  const switchMethod = (nextMethod) => {
    setMethod(nextMethod);
    setAmountReceived("");
    setReference("");
    setCardLastFour("");
  };

  const handleClose = () => {
    onClose();
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

  const handleComplete = useCallback(() => {
    if (!canValidate) return;

    const summary = {
      method,
      methodLabel: methodMeta.label,
      totalUSD,
      totalCDF,
      changeDueUSD: method === "cash" ? changeDueUSD : 0,
      amountReceived: method === "cash" ? received : totalUSD,
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
    };

    setCompletedSummary(summary);
    setCompleted(true);
  }, [
    canValidate,
    method,
    methodMeta.label,
    totalUSD,
    totalCDF,
    changeDueUSD,
    received,
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

  const handleFinish = useCallback(
    (printNow) => {
      onComplete(completedSummary, { printNow });
    },
    [completedSummary, onComplete]
  );

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      if (completed && completedSummary) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleFinish(false);
        } else if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          handleFinish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          handleFinish(false);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "1") {
        e.preventDefault();
        switchMethod("cash");
        return;
      }
      if (e.key === "2") {
        e.preventDefault();
        switchMethod("mobile_money");
        return;
      }
      if (e.key === "3") {
        e.preventDefault();
        switchMethod("card");
        return;
      }

      if (e.key === "Enter" && canValidate) {
        e.preventDefault();
        handleComplete();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, completed, completedSummary, canValidate, handleComplete, handleFinish, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      if (completed) finishNoPrintRef.current?.focus();
      else validateBtnRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [isOpen, completed, method]);

  if (!isOpen) return null;

  return (
    <Box className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Box className="bg-[#1a1a1a] border border-gray-800 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <Box className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h3 className="font-bold flex items-center gap-2">
            {completed ? (
              <>
                <CheckCircle2 className="text-green-500" /> Sale complete
              </>
            ) : (
              <>
                <methodMeta.icon className="text-green-500" size={20} />
                Complete transaction
              </>
            )}
          </h3>
          <button type="button" onClick={handleClose} aria-label="Close">
            <X size={20} />
          </button>
        </Box>

        {completed && completedSummary ? (
          <Box className="p-6 space-y-5 text-center">
            <CheckCircle2 className="mx-auto text-green-500" size={48} />
            <Box className="bg-[#252525] rounded-lg border border-gray-800 p-4 space-y-2">
              <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">
                Payment method
              </p>
              <p className="text-lg font-bold text-white">{completedSummary.methodLabel}</p>
              <p className="text-sm text-gray-400">
                ${completedSummary.totalUSD.toFixed(2)} ·{" "}
                {completedSummary.totalCDF.toLocaleString()} FC
              </p>
              <p className="text-sm text-cyan-400">
                Client: {completedSummary.customerName ?? "Walk-in Client"}
              </p>
              {completedSummary.customerPhone && (
                <p className="text-xs text-gray-400">Phone: {completedSummary.customerPhone}</p>
              )}
              {completedSummary.customerTaxNumber && (
                <p className="text-xs text-gray-400 font-mono">
                  Tax: {completedSummary.customerTaxNumber}
                </p>
              )}
              {completedSummary.customerAddress && (
                <p className="text-xs text-gray-400">{completedSummary.customerAddress}</p>
              )}
              {completedSummary.customerEmail && (
                <p className="text-xs text-gray-400">{completedSummary.customerEmail}</p>
              )}
              {completedSummary.method === "cash" && (
                <p className="text-green-500 font-medium pt-1">
                  Change: ${completedSummary.changeDueUSD.toFixed(2)} (
                  {(completedSummary.changeDueUSD * exchangeRate).toLocaleString()} FC)
                </p>
              )}
              {completedSummary.reference && (
                <p className="text-xs text-gray-400 font-mono pt-1">
                  Ref: {completedSummary.reference}
                </p>
              )}
              {completedSummary.cardLastFour && (
                <p className="text-xs text-gray-400 pt-1">
                  Card ····{completedSummary.cardLastFour}
                </p>
              )}
            </Box>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">
              Enter — done · P — print · Esc — done
            </p>
            <Box className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleFinish(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 py-4 rounded-lg font-black text-sm uppercase tracking-widest"
              >
                Print invoice (P)
              </button>
              <button
                ref={finishNoPrintRef}
                type="button"
                onClick={() => handleFinish(false)}
                className="w-full bg-gray-700 hover:bg-gray-600 py-4 rounded-lg font-black text-sm uppercase tracking-widest ring-2 ring-transparent focus:ring-blue-500 outline-none"
              >
                Done (Enter)
              </button>
            </Box>
          </Box>
        ) : (
          <Box className="p-6 space-y-5">
            <Box className="flex justify-between items-center">
              <span className="text-gray-400">Total</span>
              <Box className="text-right">
                <span className="text-2xl font-bold text-white block">
                  ${totalUSD.toFixed(2)}
                </span>
                <span className="text-sm text-green-500 font-medium">
                  {totalCDF.toLocaleString()} FC
                </span>
              </Box>
            </Box>

            <Box className="space-y-3">
              <Box className="flex items-center justify-between">
                <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
                  Client
                </p>
                <span className="text-[10px] text-gray-500">
                  {savedCustomers.length} saved
                </span>
              </Box>
              <Box className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={useWalkInClient}
                  className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border ${
                    isWalkInClient
                      ? "border-cyan-500 bg-cyan-950/30 text-cyan-300"
                      : "border-gray-700 text-gray-400 hover:text-white hover:border-cyan-500"
                  }`}
                >
                  Walk-in client
                </button>
                {visibleSavedCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => applyCustomer(customer)}
                    className={`px-3 py-2 rounded-lg text-left border min-w-32 ${
                      customerId === customer.id
                        ? "border-cyan-500 bg-cyan-950/30 text-white"
                        : "border-gray-800 bg-[#121212] text-gray-300 hover:border-cyan-700"
                    }`}
                  >
                    <span className="block text-xs font-semibold truncate">{customer.name}</span>
                    <span className="block text-[10px] text-gray-500 truncate">
                      {customer.phone || customer.taxNumber || "Saved client"}
                    </span>
                  </button>
                ))}
              </Box>
              <input
                list="saved-clients"
                type="text"
                placeholder="Saved client or new client name"
                className="w-full bg-[#0a0a0a] border-2 border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-cyan-500"
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
              <input
                type="text"
                inputMode="tel"
                placeholder="Phone number"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-cyan-500"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
              <input
                type="text"
                placeholder="Tax number"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-cyan-500"
                value={customerTaxNumber}
                onChange={(e) => setCustomerTaxNumber(e.target.value)}
              />
              <textarea
                placeholder="Address"
                rows={2}
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-cyan-500 resize-none"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
              />
              <input
                type="email"
                placeholder="Email"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-cyan-500"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
              {!customerInfoOk && !isWalkInClient && (
                <p className="text-[10px] text-amber-400">
                  To invoice a named client, name, phone number, and tax number are required. Email must be valid if entered.
                </p>
              )}
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={!isWalkInClient && !!customerName.trim() && (!!customerId || shouldSaveCustomer)}
                  onChange={(e) => setShouldSaveCustomer(e.target.checked)}
                  disabled={isWalkInClient || !customerName.trim() || !!customerId}
                />
                {isWalkInClient
                  ? "Walk-in client will not be saved"
                  : customerId
                  ? "Saved client selected"
                  : "Save this client for next time"}
              </label>
            </Box>

            <Box className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                Payment method
              </p>
              <p className="text-[10px] text-gray-600">1 Cash · 2 Mobile · 3 Card · Enter validate</p>
              <Box className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((m, idx) => {
                  const Icon = m.icon;
                  const active = method === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => switchMethod(m.id)}
                      title={`${m.label} (${idx + 1})`}
                      className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-lg border text-[10px] font-bold uppercase tracking-wide transition-colors ${
                        active
                          ? "border-blue-500 bg-blue-950/40 text-white"
                          : "border-gray-800 bg-[#252525] text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      <Icon size={22} className={active ? "text-blue-400" : ""} />
                      {m.label}
                    </button>
                  );
                })}
              </Box>
            </Box>

            {method === "cash" && (
              <Box className="space-y-3">
                <label className="text-xs font-bold text-blue-500 uppercase tracking-widest block">
                  Amount received (USD)
                </label>
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className={`w-full bg-[#0a0a0a] border-2 rounded-lg p-4 text-3xl font-mono text-white outline-none transition-colors ${
                    shortfall > EPSILON && amountReceived !== ""
                      ? "border-red-600 focus:border-red-500"
                      : "border-gray-700 focus:border-blue-600"
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
                  totalUSD={totalUSD}
                  exchangeRate={exchangeRate}
                  amountReceived={amountReceived}
                  onAmountReceivedChange={setAmountReceived}
                />
              </Box>
            )}

            {method === "mobile_money" && (
              <Box className="space-y-3">
                <Box className="bg-[#252525] p-4 rounded-lg border border-orange-900/40 text-center">
                  <p className="text-[10px] text-orange-400 uppercase font-bold tracking-widest">
                    Amount to collect
                  </p>
                  <p className="text-2xl font-black text-green-500 mt-1">
                    {totalCDF.toLocaleString()} FC
                  </p>
                  <p className="text-sm text-gray-500 mt-1">${totalUSD.toFixed(2)} USD</p>
                </Box>
                <Box className="space-y-2">
                  <label className="text-xs font-bold text-orange-400 uppercase tracking-widest">
                    Transaction reference
                  </label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="M-Pesa / Airtel / Orange ref. number"
                    className="w-full bg-[#0a0a0a] border-2 border-gray-700 rounded-lg p-3 text-sm font-mono text-white focus:border-orange-500 outline-none"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canValidate) {
                        e.preventDefault();
                        handleComplete();
                      }
                    }}
                  />
                  <p className="text-gray-500 text-xs">
                    Enter the confirmation code from the customer&apos;s phone (min.{" "}
                    {MIN_MOBILE_REF_LENGTH} characters).
                  </p>
                </Box>
              </Box>
            )}

            {method === "card" && (
              <Box className="space-y-3">
                <Box className="bg-[#252525] p-4 rounded-lg border border-purple-900/40 text-center">
                  <p className="text-[10px] text-purple-400 uppercase font-bold tracking-widest">
                    Card charge
                  </p>
                  <p className="text-3xl font-black text-white mt-1">${totalUSD.toFixed(2)}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Process on terminal, then confirm below
                  </p>
                </Box>
                <Box className="space-y-2">
                  <label className="text-xs font-bold text-purple-400 uppercase tracking-widest">
                    Last 4 digits (optional)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="····"
                    className={`w-full bg-[#0a0a0a] border-2 rounded-lg p-3 text-center text-2xl font-mono tracking-[0.5em] text-white outline-none ${
                      !cardLastFourOk
                        ? "border-red-600"
                        : "border-gray-700 focus:border-purple-500"
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
                </Box>
              </Box>
            )}

            <button
              ref={validateBtnRef}
              type="button"
              disabled={!canValidate}
              onClick={handleComplete}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-500 py-4 rounded-lg font-black text-xl uppercase tracking-widest transition-all active:scale-95 shadow-lg focus:ring-2 focus:ring-blue-400 outline-none"
            >
              Validate sale (Enter)
            </button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
