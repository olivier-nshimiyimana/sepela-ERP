/** USD display: $5 instead of $5.00; keeps cents when needed ($5.50). */
export function formatMoneyUSD(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "$0";
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return `$${rounded}`;
  return `$${rounded.toFixed(2)}`;
}
