import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, X, XCircle } from "lucide-react";
import { useLocale } from "../contexts/LocaleContext";
import {
  daysUntilExpiry,
  formatExpiryDate,
  getExpiryAlerts,
} from "../utils/productExpiry";

const Box = "d" + "iv";

export default function ExpiryAlertsBanner({ products, expiryAlertDays, onManageProducts }) {
  const { t } = useLocale();
  const { expiringSoon, expired } = getExpiryAlerts(products, expiryAlertDays);
  const total = expiringSoon.length + expired.length;
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (total === 0) return null;

  const summaryParts = [];
  if (expired.length) summaryParts.push(t("expiry.expired", { count: expired.length }));
  if (expiringSoon.length) summaryParts.push(t("expiry.expiringSoon", { count: expiringSoon.length }));

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        className="fixed top-16 right-3 z-40 flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-[#3a3020] text-amber-300 shadow-lg hover:bg-[#4a3a28] font-bold"
        title={t("expiry.showAlerts")}
      >
        <AlertTriangle size={14} />
        <span className="sepela-badge">{total}</span>
      </button>
    );
  }

  return (
    <Box
      className="fixed top-16 right-3 z-40 w-72 max-w-[calc(100vw-1.5rem)] sepela-toast-panel overflow-hidden"
      role="status"
      aria-live="polite"
    >
      <Box className="flex items-start gap-2 px-3 py-2">
        <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <Box className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-amber-300 leading-tight">{t("expiry.title")}</p>
          <p className="sepela-hint mt-0.5 truncate">{summaryParts.join(" · ")}</p>
        </Box>
        <Box className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="p-1 rounded sepela-text-secondary hover:text-amber-300"
            aria-label={expanded ? t("expiry.collapse") : t("expiry.expand")}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              setExpanded(false);
            }}
            className="p-1 rounded sepela-text-secondary hover:text-white"
            aria-label={t("expiry.dismiss")}
          >
            <X size={14} />
          </button>
        </Box>
      </Box>

      {expanded ? (
        <Box className="border-t border-amber-900/40 px-3 py-2 max-h-36 overflow-y-auto space-y-1.5">
          {expired.map((p) => (
            <AlertLine
              key={p.id}
              variant="expired"
              name={p.name}
              detail={t("expiry.lotExpired", {
                lot: p.lotNumber,
                date: formatExpiryDate(p.expirationDate),
              })}
            />
          ))}
          {expiringSoon.map((p) => {
            const days = daysUntilExpiry(p.expirationDate);
            return (
              <AlertLine
                key={p.id}
                variant="soon"
                name={p.name}
                detail={t("expiry.lotDaysLeft", {
                  lot: p.lotNumber,
                  days: days === 0 ? t("expiry.today") : t("expiry.daysLeft", { days }),
                })}
              />
            );
          })}
          <button
            type="button"
            onClick={onManageProducts}
            className="sepela-btn-secondary w-full mt-1 !text-amber-400"
          >
            {t("expiry.reviewInventory")}
          </button>
        </Box>
      ) : (
        <Box className="px-3 pb-2 flex gap-2">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="sepela-btn-secondary flex-1 !text-sepela-muted hover:!text-amber-300"
          >
            {t("common.details")}
          </button>
          <button
            type="button"
            onClick={onManageProducts}
            className="sepela-btn-secondary flex-1 !text-amber-400"
          >
            {t("expiry.review")}
          </button>
        </Box>
      )}
    </Box>
  );
}

function AlertLine({ variant, name, detail }) {
  const isExpired = variant === "expired";
  return (
    <Box
      className={`flex items-start gap-1.5 text-[10px] leading-snug ${
        isExpired ? "text-red-300" : "text-amber-200"
      }`}
    >
      {isExpired ? <XCircle size={11} className="shrink-0 mt-0.5" /> : <AlertTriangle size={11} className="shrink-0 mt-0.5" />}
      <Box className="min-w-0">
        <span className="font-bold block truncate">{name}</span>
        <span className="sepela-text-secondary">{detail}</span>
      </Box>
    </Box>
  );
}
