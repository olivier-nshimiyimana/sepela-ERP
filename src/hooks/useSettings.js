import { useCallback, useMemo } from "react";
import { DEFAULT_EXPIRY_ALERT_DAYS } from "../utils/productExpiry";
import { DEFAULT_INVOICE_PROFILE } from "../data/defaultInvoiceProfile";
import { useLocalStorage } from "./useLocalStorage";

const DEFAULT_RATE = 2850;

function mergeInvoiceProfile(raw) {
  return { ...DEFAULT_INVOICE_PROFILE, ...(raw && typeof raw === "object" ? raw : {}) };
}

export function useSettings() {
  const [exchangeRate, setExchangeRate] = useLocalStorage("sepela-exchange-rate", DEFAULT_RATE);
  const [expiryAlertDays, setExpiryAlertDays] = useLocalStorage(
    "sepela-expiry-alert-days",
    DEFAULT_EXPIRY_ALERT_DAYS
  );
  const [invoiceProfileRaw, setInvoiceProfileRaw] = useLocalStorage(
    "sepela-invoice-profile",
    DEFAULT_INVOICE_PROFILE
  );

  const invoiceProfile = useMemo(
    () => mergeInvoiceProfile(invoiceProfileRaw),
    [invoiceProfileRaw]
  );

  const updateExchangeRate = useCallback(
    (rate) => {
      const parsed = parseFloat(rate);
      if (Number.isNaN(parsed) || parsed <= 0) {
        return { ok: false, error: "Enter a valid exchange rate." };
      }
      setExchangeRate(parsed);
      return { ok: true };
    },
    [setExchangeRate]
  );

  const updateExpiryAlertDays = useCallback(
    (days) => {
      const parsed = parseInt(days, 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 365) {
        return { ok: false, error: "Alert window must be between 1 and 365 days." };
      }
      setExpiryAlertDays(parsed);
      return { ok: true };
    },
    [setExpiryAlertDays]
  );

  const updateInvoiceProfile = useCallback(
    (partial) => {
      setInvoiceProfileRaw((prev) => mergeInvoiceProfile({ ...prev, ...partial }));
      return { ok: true };
    },
    [setInvoiceProfileRaw]
  );

  return {
    exchangeRate,
    expiryAlertDays,
    invoiceProfile,
    updateExchangeRate,
    updateExpiryAlertDays,
    updateInvoiceProfile,
  };
}
