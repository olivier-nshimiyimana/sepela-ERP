import { quickTenderAmounts } from "./changeCalculator";
import { formatMoneyUSD } from "./formatMoney";
import { roundCdf, roundUsd } from "./moneyRounding";

export { roundCdf, roundUsd, sumUsd, sumCdf, lineTotalUsd, percentOfUsd } from "./moneyRounding";

export const CURRENCY = {
  CDF: "CDF",
  USD: "USD",
};

export const DEFAULT_PRIMARY_CURRENCY = CURRENCY.CDF;

export function normalizePrimaryCurrency(value) {
  return value === CURRENCY.USD ? CURRENCY.USD : CURRENCY.CDF;
}

export function usdToCdf(amountUsd, exchangeRate) {
  const usd = roundUsd(amountUsd);
  const rate = Number(exchangeRate) || 0;
  return roundCdf(usd * rate);
}

export function cdfToUsd(amountCdf, exchangeRate) {
  const cdf = roundCdf(amountCdf);
  const rate = Number(exchangeRate) || 0;
  if (rate <= 0) return 0;
  return roundUsd(cdf / rate);
}

export function formatMoneyCDF(amount) {
  return formatMoneyCDFValue(roundCdf(amount));
}

export function formatMoneyCDFValue(cdfInteger) {
  const n = roundCdf(cdfInteger);
  if (!Number.isFinite(n)) return "0 FC";
  return `${n.toLocaleString()}\u00a0FC`;
}

/** Primary + secondary labels for a USD-stored amount. */
export function formatDualCurrency(amountUsd, exchangeRate, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  const primary = normalizePrimaryCurrency(primaryCurrency);
  const usd = roundUsd(amountUsd);
  const cdf = usdToCdf(usd, exchangeRate);

  if (primary === CURRENCY.CDF) {
    return {
      primary: formatMoneyCDFValue(cdf),
      secondary: formatMoneyUSD(usd),
      primaryCode: CURRENCY.CDF,
      secondaryCode: CURRENCY.USD,
      cdf,
      usd,
    };
  }

  return {
    primary: formatMoneyUSD(usd),
    secondary: formatMoneyCDFValue(cdf),
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
  return roundUsd(raw);
}

export function moneyFieldLabel(baseLabel, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  const code = normalizePrimaryCurrency(primaryCurrency);
  return `${baseLabel} (${code})`;
}

/** USD stored amount → string for a money input when primary is CDF. */
export function usdToPrimaryInput(usd, exchangeRate, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  const n = roundUsd(usd);
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

/**
 * Integer-primary change for a sale (CDF-first; avoids USD round-trip on receipts).
 */
export function saleChangePrimary(sale, exchangeRate, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  const primary = normalizePrimaryCurrency(primaryCurrency);
  const rate = saleExchangeRate(sale, exchangeRate);

  if (primary === CURRENCY.CDF) {
    const storedCdf = sale?.changeDueCDF ?? sale?.changePrimary;
    if (storedCdf != null && roundCdf(storedCdf) > 0) {
      return roundCdf(storedCdf);
    }
    const receivedPrimary = sale?.amountReceivedPrimary;
    if (receivedPrimary != null && Number.isFinite(Number(receivedPrimary))) {
      const totalCdf = roundCdf(sale?.totalCDF ?? usdToCdf(sale?.totalUSD, rate));
      return Math.max(0, roundCdf(receivedPrimary) - totalCdf);
    }
    return usdToCdf(sale?.changeDueUSD ?? 0, rate);
  }

  return roundUsd(sale?.changeDueUSD ?? 0);
}

export function formatSaleChange(sale, exchangeRate, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  const primary = normalizePrimaryCurrency(primaryCurrency);
  const rate = saleExchangeRate(sale, exchangeRate);
  const changePrimary = saleChangePrimary(sale, rate, primary);

  if (primary === CURRENCY.CDF) {
    const changeUsd = cdfToUsd(changePrimary, rate);
    return {
      primary: formatMoneyCDFValue(changePrimary),
      secondary: formatMoneyUSD(changeUsd),
      changePrimary,
      changeUsd,
    };
  }

  const changeUsd = roundUsd(changePrimary);
  return {
    primary: formatMoneyUSD(changeUsd),
    secondary: formatMoneyCDFValue(usdToCdf(changeUsd, rate)),
    changePrimary: changeUsd,
    changeUsd,
  };
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
