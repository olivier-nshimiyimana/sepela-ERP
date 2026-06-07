import { quickTenderAmounts } from "./changeCalculator";
import { formatMoneyUSD } from "./formatMoney";

export const CURRENCY = {
  CDF: "CDF",
  USD: "USD",
};

export const DEFAULT_PRIMARY_CURRENCY = CURRENCY.CDF;

export function normalizePrimaryCurrency(value) {
  return value === CURRENCY.USD ? CURRENCY.USD : CURRENCY.CDF;
}

export function usdToCdf(amountUsd, exchangeRate) {
  const usd = Number(amountUsd) || 0;
  const rate = Number(exchangeRate) || 0;
  return Math.round(usd * rate);
}

export function cdfToUsd(amountCdf, exchangeRate) {
  const cdf = Number(amountCdf) || 0;
  const rate = Number(exchangeRate) || 0;
  if (rate <= 0) return 0;
  return cdf / rate;
}

export function formatMoneyCDF(amount) {
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n)) return "0 FC";
  return `${n.toLocaleString()} FC`;
}

/** Primary + secondary labels for a USD-stored amount. */
export function formatDualCurrency(amountUsd, exchangeRate, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  const primary = normalizePrimaryCurrency(primaryCurrency);
  const usd = Number(amountUsd) || 0;
  const cdf = usdToCdf(usd, exchangeRate);

  if (primary === CURRENCY.CDF) {
    return {
      primary: formatMoneyCDF(cdf),
      secondary: formatMoneyUSD(usd),
      primaryCode: CURRENCY.CDF,
      secondaryCode: CURRENCY.USD,
      cdf,
      usd,
    };
  }

  return {
    primary: formatMoneyUSD(usd),
    secondary: formatMoneyCDF(cdf),
    primaryCode: CURRENCY.USD,
    secondaryCode: CURRENCY.CDF,
    cdf,
    usd,
  };
}

export function exchangeRateLabel(exchangeRate, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  const primary = normalizePrimaryCurrency(primaryCurrency);
  const rate = Number(exchangeRate) || 0;
  if (rate <= 0) return "";
  if (primary === CURRENCY.CDF) {
    return `1 USD = ${rate.toLocaleString()} CDF`;
  }
  return `1 USD = ${rate.toLocaleString()} CDF`;
}

/** Cash received in primary currency → USD for storage. */
export function cashReceivedToUsd(amountReceived, exchangeRate, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  const raw = Number(amountReceived);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  if (normalizePrimaryCurrency(primaryCurrency) === CURRENCY.CDF) {
    return cdfToUsd(raw, exchangeRate);
  }
  return raw;
}

export function moneyFieldLabel(baseLabel, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  const code = normalizePrimaryCurrency(primaryCurrency);
  return `${baseLabel} (${code})`;
}

/** USD stored amount → string for a money input when primary is CDF. */
export function usdToPrimaryInput(usd, exchangeRate, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (normalizePrimaryCurrency(primaryCurrency) === CURRENCY.CDF) {
    return String(usdToCdf(n, exchangeRate));
  }
  return String(n);
}

/** Money input (primary currency) → USD for storage. */
export function primaryInputToUsd(value, exchangeRate, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  return cashReceivedToUsd(value, exchangeRate, primaryCurrency);
}

export function formatMoneyPrimary(amountUsd, exchangeRate, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  return formatDualCurrency(amountUsd, exchangeRate, primaryCurrency).primary;
}

export function formatMoneyPairLine(amountUsd, exchangeRate, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  const dual = formatDualCurrency(amountUsd, exchangeRate, primaryCurrency);
  return `${dual.primary} · ≈ ${dual.secondary}`;
}

export function saleExchangeRate(sale, fallbackRate = 2850) {
  const rate = Number(sale?.exchangeRate ?? fallbackRate);
  return rate > 0 ? rate : fallbackRate;
}

export function quickTenderAmountsPrimary(totalUSD, exchangeRate, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  const primary = normalizePrimaryCurrency(primaryCurrency);
  if (primary === CURRENCY.CDF) {
    const total = usdToCdf(totalUSD, exchangeRate);
    const step = total >= 50000 ? 5000 : total >= 10000 ? 1000 : 500;
    const rounded = Math.ceil(total / step) * step;
    const candidates = new Set([total, rounded, rounded + step, rounded + step * 2]);
    return [...candidates].filter((n) => n >= total).sort((a, b) => a - b).slice(0, 4);
  }

  return quickTenderAmounts(totalUSD);
}
