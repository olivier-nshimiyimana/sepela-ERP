import { formatDualCurrency } from "../utils/currency";

const Box = "d" + "iv";

export default function DualCurrencyAmount({
  amountUsd,
  exchangeRate,
  primaryCurrency,
  size = "md",
  align = "left",
  primaryClassName = "",
  secondaryClassName = "",
}) {
  const dual = formatDualCurrency(amountUsd, exchangeRate, primaryCurrency);
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  const primarySize =
    size === "xl"
      ? "text-4xl font-black italic"
      : size === "lg"
        ? "text-2xl font-bold"
        : size === "sm"
          ? "text-sm font-semibold"
          : "text-xl font-bold";

  const secondarySize = size === "xl" ? "text-sm" : "text-xs";

  return (
    <Box className={alignClass}>
      <p className={`${primarySize} text-white ${primaryClassName}`.trim()}>{dual.primary}</p>
      <p className={`${secondarySize} text-gray-500 mt-0.5 ${secondaryClassName}`.trim()}>
        ≈ {dual.secondary}
      </p>
    </Box>
  );
}
