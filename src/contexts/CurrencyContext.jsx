import { createContext, useContext, useMemo } from "react";
import {
  CURRENCY,
  DEFAULT_PRIMARY_CURRENCY,
  exchangeRateLabel,
  formatDualCurrency,
  formatMoneyPairLine,
  formatMoneyPrimary,
  moneyFieldLabel,
  normalizePrimaryCurrency,
  primaryInputToUsd,
  usdToPrimaryInput,
} from "../utils/currency";

const CurrencyContext = createContext(null);

const FALLBACK = {
  primaryCurrency: DEFAULT_PRIMARY_CURRENCY,
  secondaryCurrency: CURRENCY.USD,
  exchangeRate: 2850,
  formatPrimary: (amountUsd) => formatMoneyPrimary(amountUsd, 2850, DEFAULT_PRIMARY_CURRENCY),
  formatSecondary: (amountUsd) =>
    formatDualCurrency(amountUsd, 2850, DEFAULT_PRIMARY_CURRENCY).secondary,
  formatDual: (amountUsd) => formatDualCurrency(amountUsd, 2850, DEFAULT_PRIMARY_CURRENCY),
  formatPairLine: (amountUsd) => formatMoneyPairLine(amountUsd, 2850, DEFAULT_PRIMARY_CURRENCY),
  fieldLabel: (name) => moneyFieldLabel(name, DEFAULT_PRIMARY_CURRENCY),
  inputStep: "1",
  usdToInput: (usd) => usdToPrimaryInput(usd, 2850, DEFAULT_PRIMARY_CURRENCY),
  inputToUsd: (value) => primaryInputToUsd(value, 2850, DEFAULT_PRIMARY_CURRENCY),
  rateLabel: () => exchangeRateLabel(2850, DEFAULT_PRIMARY_CURRENCY),
  isCdfPrimary: true,
};

export function CurrencyProvider({ exchangeRate = 2850, primaryCurrency = DEFAULT_PRIMARY_CURRENCY, children }) {
  const value = useMemo(() => {
    const primary = normalizePrimaryCurrency(primaryCurrency);
    const secondary = primary === CURRENCY.CDF ? CURRENCY.USD : CURRENCY.CDF;
    const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 2850;

    const withRate = (amountUsd, saleRate) => {
      const r = Number(saleRate) > 0 ? Number(saleRate) : rate;
      return formatDualCurrency(amountUsd, r, primary);
    };

    return {
      primaryCurrency: primary,
      secondaryCurrency: secondary,
      exchangeRate: rate,
      formatPrimary: (amountUsd, saleRate) => withRate(amountUsd, saleRate).primary,
      formatSecondary: (amountUsd, saleRate) => withRate(amountUsd, saleRate).secondary,
      formatDual: (amountUsd, saleRate) => withRate(amountUsd, saleRate),
      formatPairLine: (amountUsd, saleRate) => {
        const dual = withRate(amountUsd, saleRate);
        return `${dual.primary} · ≈ ${dual.secondary}`;
      },
      fieldLabel: (name) => moneyFieldLabel(name, primary),
      inputStep: primary === CURRENCY.CDF ? "1" : "0.01",
      usdToInput: (usd, saleRate) => usdToPrimaryInput(usd, saleRate ?? rate, primary),
      inputToUsd: (value, saleRate) => primaryInputToUsd(value, saleRate ?? rate, primary),
      rateLabel: () => exchangeRateLabel(rate, primary),
      isCdfPrimary: primary === CURRENCY.CDF,
    };
  }, [exchangeRate, primaryCurrency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext) ?? FALLBACK;
}
