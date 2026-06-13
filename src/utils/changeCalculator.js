import {
  CURRENCY,
  cdfToUsd,
  normalizePrimaryCurrency,
  roundUsd,
  usdToCdf,
} from "./currency";
import { roundCdf } from "./moneyRounding";

const EPSILON = 0.001;

/** @deprecated Use roundUsd from currency/moneyRounding */
export function roundMoney(n) {
  return roundUsd(n);
}

export function computeCashPayment(received, totalUSD) {
  const receivedN = roundUsd(received);
  const total = roundUsd(totalUSD);
  const canPay = total > 0 && receivedN + EPSILON >= total;
  const changeDueUSD = canPay ? roundUsd(receivedN - total) : 0;
  const shortfallUSD = canPay ? 0 : roundUsd(Math.max(0, total - receivedN));

  return { receivedN, canPay, changeDueUSD, shortfallUSD };
}

/** Cash payment with integer-primary change (avoids USD round-trip errors in CDF). */
export function computeCashPaymentInPrimary(
  receivedPrimary,
  totalUSD,
  exchangeRate,
  primaryCurrency = CURRENCY.CDF
) {
  const primary = normalizePrimaryCurrency(primaryCurrency);
  const total = Number(totalUSD) || 0;
  const rate = Number(exchangeRate) || 0;

  if (primary === CURRENCY.CDF) {
    const receivedCdf = roundCdf(receivedPrimary);
    const totalCdf = usdToCdf(total, rate);
    const canPay = totalCdf > 0 && receivedCdf >= totalCdf;
    const changeCdf = canPay ? receivedCdf - totalCdf : 0;
    const shortfallCdf = canPay ? 0 : Math.max(0, totalCdf - receivedCdf);
    return {
      canPay,
      changeDueUSD: cdfToUsd(changeCdf, rate),
      shortfallUSD: cdfToUsd(shortfallCdf, rate),
      changePrimary: changeCdf,
      changeDueCDF: changeCdf,
      shortfallPrimary: shortfallCdf,
      totalPrimary: totalCdf,
    };
  }

  const receivedUsd = roundUsd(receivedPrimary);
  const result = computeCashPayment(receivedUsd, total);
  return {
    ...result,
    changePrimary: result.changeDueUSD,
    shortfallPrimary: result.shortfallUSD,
    totalPrimary: total,
  };
}

/** Quick tender amounts for cashiers (exact + rounded-up common bills). */
export function quickTenderAmounts(totalUSD) {
  const total = roundUsd(totalUSD);
  const candidates = new Set([total]);
  for (const bill of [5, 10, 20, 50, 100]) {
    if (bill >= total - EPSILON) candidates.add(bill);
    else candidates.add(roundUsd(Math.ceil(total / bill) * bill));
  }
  return [...candidates].sort((a, b) => a - b).slice(0, 6);
}
