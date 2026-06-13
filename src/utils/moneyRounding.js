/** USD: 2 decimal places. CDF: whole francs (no fractional FC in POS). */

const USD_SCALE = 100;

export function roundUsd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * USD_SCALE) / USD_SCALE;
}

export function roundCdf(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function sumUsd(amounts) {
  const values = Array.isArray(amounts) ? amounts : [];
  return roundUsd(values.reduce((sum, value) => sum + (Number(value) || 0), 0));
}

export function sumCdf(amounts) {
  const values = Array.isArray(amounts) ? amounts : [];
  return roundCdf(values.reduce((sum, value) => sum + (Number(value) || 0), 0));
}

export function lineTotalUsd(price, qty) {
  const unit = roundUsd(price);
  const quantity = Math.max(0, parseInt(qty, 10) || 0);
  return roundUsd(unit * quantity);
}

export function percentOfUsd(amountUsd, percent) {
  const base = roundUsd(amountUsd);
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  return roundUsd((base * pct) / 100);
}
