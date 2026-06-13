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
      ? "text-[2.75rem] leading-none font-bold"
      : size === "lg"
        ? "text-3xl font-bold"
        : size === "sm"
          ? "text-base font-bold"
          : "text-2xl font-bold";

  const secondarySize =
    size === "xl" ? "text-sm font-semibold" : size === "lg" ? "text-xs font-semibold" : "text-xs font-semibold";

  return (
    <Box className={alignClass}>
      <p className={`sepela-money ${primarySize} text-white ${primaryClassName}`.trim()}>{dual.primary}</p>
      <p className={`sepela-money ${secondarySize} text-sepela-muted mt-0.5 ${secondaryClassName}`.trim()}>
        ≈ {dual.secondary}
      </p>
    </Box>
  );
}
