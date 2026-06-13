import {
  computeCashPaymentInPrimary,
} from "../utils/changeCalculator";
import { useLocale } from "../contexts/LocaleContext";
import {
  CURRENCY,
  formatDualCurrency,
  formatMoneyCDF,
  normalizePrimaryCurrency,
  quickTenderAmountsPrimary,
} from "../utils/currency";
import { formatMoneyUSD } from "../utils/formatMoney";

const Box = "d" + "iv";

export default function ChangeCalculator({
  totalUSD,
  exchangeRate,
  primaryCurrency,
  amountReceived,
  onAmountReceivedChange,
  compact = false,
}) {
  const { t } = useLocale();
  const primary = normalizePrimaryCurrency(primaryCurrency);
  const receivedRaw = parseFloat(amountReceived) || 0;
  const payment = computeCashPaymentInPrimary(
    amountReceived,
    totalUSD,
    exchangeRate,
    primary
  );
  const { canPay, changeDueUSD, shortfallUSD, changePrimary, shortfallPrimary } = payment;
  const changeDual = formatDualCurrency(changeDueUSD, exchangeRate, primary);
  const shortfallDual = formatDualCurrency(shortfallUSD, exchangeRate, primary);
  const totalDual = formatDualCurrency(totalUSD, exchangeRate, primary);
  const quickAmounts = quickTenderAmountsPrimary(totalUSD, exchangeRate, primary);
  const isCdf = primary === CURRENCY.CDF;

  const formatReceived = (value) =>
    isCdf ? formatMoneyCDF(value) : formatMoneyUSD(value);

  const formatQuickLabel = (amt) => {
    if (isCdf) {
      const totalCdf = payment.totalPrimary ?? 0;
      return Math.abs(amt - totalCdf) < 1 ? t("payment.exact") : formatMoneyCDF(amt);
    }
    return Math.abs(amt - totalUSD) < 0.01 ? t("payment.exact") : formatMoneyUSD(amt);
  };

  const setQuickAmount = (amt) => {
    onAmountReceivedChange(isCdf ? String(amt) : amt.toFixed(2));
  };

  const receivedMatches = (amt) =>
    isCdf ? Math.abs(receivedRaw - amt) < 1 : Math.abs(receivedRaw - amt) < 0.01;

  const changePrimaryLabel =
    isCdf && changePrimary != null
      ? formatMoneyCDF(changePrimary)
      : changeDual.primary;

  const shortfallPrimaryLabel =
    isCdf && shortfallPrimary != null
      ? formatMoneyCDF(shortfallPrimary)
      : shortfallDual.primary;

  if (compact) {
    return (
      <Box className="sepela-checkout__tender">
        <Box className="sepela-checkout__quick">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => setQuickAmount(amt)}
              className={`sepela-checkout__quick-btn ${
                receivedMatches(amt) ? "sepela-checkout__quick-btn--active" : ""
              }`}
            >
              {formatQuickLabel(amt)}
            </button>
          ))}
        </Box>
        {canPay ? (
          <Box className="sepela-checkout__change sepela-checkout__change--ok">
            <span className="sepela-checkout__change-label">
              {changeDueUSD < 0.01 ? t("payment.exactPayment") : t("payment.giveChange")}
            </span>
            {changeDueUSD >= 0.01 && (
              <span className="sepela-checkout__change-value sepela-money">
                {changePrimaryLabel}
                <span className="sepela-checkout__change-secondary">≈ {changeDual.secondary}</span>
              </span>
            )}
          </Box>
        ) : receivedRaw > 0 ? (
          <Box className="sepela-checkout__change sepela-checkout__change--due">
            <span className="sepela-checkout__change-label">{t("payment.stillNeeded")}</span>
            <span className="sepela-checkout__change-value sepela-money">{shortfallPrimaryLabel}</span>
          </Box>
        ) : (
          <p className="sepela-checkout__hint">{t("payment.enterAmountHint")}</p>
        )}
      </Box>
    );
  }

  return (
    <Box className="space-y-3">
      <Box className="flex flex-wrap gap-2">
        {quickAmounts.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => setQuickAmount(amt)}
            className={`sepela-choice !w-auto px-3 py-1.5 text-xs ${
              receivedMatches(amt) ? "sepela-choice--active" : ""
            }`}
          >
            {formatQuickLabel(amt)}
          </button>
        ))}
      </Box>

      {canPay ? (
        <Box className="sepela-panel p-4 text-center space-y-1 bg-[#1a3a28]">
          <p className="sepela-label text-green-500">
            {changeDueUSD < 0.01 ? t("payment.exactPayment") : t("payment.giveChange")}
          </p>
          {changeDueUSD >= 0.01 && (
            <>
              <p className="text-4xl font-black text-white tabular-nums">{changePrimaryLabel}</p>
              <p className="text-xl font-bold text-green-400 tabular-nums">
                ≈ {changeDual.secondary}
              </p>
            </>
          )}
          <p className="text-xs sepela-text-muted pt-2 font-mono">
            {t("payment.receivedTotal", {
              received: formatReceived(receivedRaw),
              total: totalDual.primary,
            })}
            {changeDueUSD >= 0.01 &&
              ` = ${changePrimaryLabel} ${t("payment.change").toLowerCase()}`}
          </p>
        </Box>
      ) : receivedRaw > 0 ? (
        <Box className="sepela-panel p-4 text-center bg-[#3a2828]">
          <p className="sepela-label text-red-400">
            {t("payment.stillNeeded")}
          </p>
          <p className="text-3xl font-black text-red-300 tabular-nums mt-1">
            {shortfallPrimaryLabel}
          </p>
          <p className="text-sm text-red-400/90">≈ {shortfallDual.secondary}</p>
          <p className="text-xs sepela-text-secondary mt-2">
            {t("payment.receivedShort", {
              received: formatReceived(receivedRaw),
              total: totalDual.primary,
            })}
          </p>
        </Box>
      ) : (
        <p className="text-xs sepela-text-secondary text-center">
          {t("payment.enterAmountHint")}
        </p>
      )}
    </Box>
  );
}
