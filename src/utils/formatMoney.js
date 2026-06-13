import { roundUsd } from "./moneyRounding";

/** USD display: $5 instead of $5.00; keeps cents when needed ($5.50). */
export function formatMoneyUSD(amount) {
  const rounded = roundUsd(amount);
  if (!Number.isFinite(rounded)) return "$0";
  if (Number.isInteger(rounded)) return `$${rounded}`;
  return `$${rounded.toFixed(2)}`;
}
