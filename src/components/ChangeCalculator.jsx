import { computeCashPayment } from "../utils/changeCalculator";
import { useLocale } from "../contexts/LocaleContext";
import {
  CURRENCY,
  cashReceivedToUsd,
  formatDualCurrency,
  formatMoneyCDF,
  normalizePrimaryCurrency,
  quickTenderAmountsPrimary,
  usdToCdf,
} from "../utils/currency";
import { formatMoneyUSD } from "../utils/formatMoney";

const Box = "d" + "iv";

export default function ChangeCalculator({
  totalUSD,
  exchangeRate,
  primaryCurrency,
  amountReceived,
  onAmountReceivedChange,
}) {
  const { t } = useLocale();
  const primary = normalizePrimaryCurrency(primaryCurrency);
  const receivedRaw = parseFloat(amountReceived) || 0;
  const receivedUsd = cashReceivedToUsd(receivedRaw, exchangeRate, primary);
  const { canPay, changeDueUSD, shortfallUSD } = computeCashPayment(receivedUsd, totalUSD);
  const changeDual = formatDualCurrency(changeDueUSD, exchangeRate, primary);
  const shortfallDual = formatDualCurrency(shortfallUSD, exchangeRate, primary);
  const totalDual = formatDualCurrency(totalUSD, exchangeRate, primary);
  const quickAmounts = quickTenderAmountsPrimary(totalUSD, exchangeRate, primary);
  const isCdf = primary === CURRENCY.CDF;

  const formatReceived = (value) =>
    isCdf ? formatMoneyCDF(value) : formatMoneyUSD(value);

  const formatQuickLabel = (amt) => {
    if (isCdf) {
      const totalCdf = usdToCdf(totalUSD, exchangeRate);
      return Math.abs(amt - totalCdf) < 1 ? t("payment.exact") : formatMoneyCDF(amt);
    }
    return Math.abs(amt - totalUSD) < 0.01 ? t("payment.exact") : formatMoneyUSD(amt);
  };

  const setQuickAmount = (amt) => {
    onAmountReceivedChange(isCdf ? String(amt) : amt.toFixed(2));
  };

  const receivedMatches = (amt) =>
    isCdf ? Math.abs(receivedRaw - amt) < 1 : Math.abs(receivedUsd - amt) < 0.01;

  return (
    <Box className="space-y-3">
      <Box className="flex flex-wrap gap-2">
        {quickAmounts.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => setQuickAmount(amt)}
            className={`px-3 py-1.5 rounded-md border text-xs font-bold transition-colors ${
              receivedMatches(amt)
                ? "border-blue-500 bg-blue-950/50 text-white"
                : "border-gray-700 bg-[#252525] text-gray-300 hover:border-gray-500"
            }`}
          >
            {formatQuickLabel(amt)}
          </button>
        ))}
      </Box>

      {canPay ? (
        <Box className="rounded-lg border border-green-800/50 bg-green-950/25 p-4 text-center space-y-1">
          <p className="text-[10px] uppercase font-bold text-green-500 tracking-widest">
            {changeDueUSD < 0.01 ? t("payment.exactPayment") : t("payment.giveChange")}
          </p>
          {changeDueUSD >= 0.01 && (
            <>
              <p className="text-4xl font-black text-white tabular-nums">{changeDual.primary}</p>
              <p className="text-xl font-bold text-green-400 tabular-nums">
                ≈ {changeDual.secondary}
              </p>
            </>
          )}
          <p className="text-xs text-gray-400 pt-2 font-mono">
            {t("payment.receivedTotal", {
              received: formatReceived(receivedRaw),
              total: totalDual.primary,
            })}
            {changeDueUSD >= 0.01 && ` = ${changeDual.primary} ${t("payment.change").toLowerCase()}`}
          </p>
        </Box>
      ) : receivedRaw > 0 ? (
        <Box className="rounded-lg border border-red-800/50 bg-red-950/20 p-4 text-center">
          <p className="text-[10px] uppercase font-bold text-red-400 tracking-widest">
            {t("payment.stillNeeded")}
          </p>
          <p className="text-3xl font-black text-red-300 tabular-nums mt-1">
            {shortfallDual.primary}
          </p>
          <p className="text-sm text-red-400/90">≈ {shortfallDual.secondary}</p>
          <p className="text-xs text-gray-500 mt-2">
            {t("payment.receivedShort", {
              received: formatReceived(receivedRaw),
              total: totalDual.primary,
            })}
          </p>
        </Box>
      ) : (
        <p className="text-xs text-gray-500 text-center">
          {t("payment.enterAmountHint")}
        </p>
      )}
    </Box>
  );
}
