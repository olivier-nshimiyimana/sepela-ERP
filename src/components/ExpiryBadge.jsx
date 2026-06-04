import {
  daysUntilExpiry,
  expiryStatusLabel,
  formatExpiryDate,
  getExpiryStatus,
} from "../utils/productExpiry";

export default function ExpiryBadge({ expirationDate, alertDays, compact = false }) {
  const status = getExpiryStatus(expirationDate, alertDays);
  const days = daysUntilExpiry(expirationDate);

  if (status === "ok" && compact) return null;

  const styles = {
    ok: "text-gray-500 border-gray-800",
    soon: "text-amber-400 border-amber-900/60 bg-amber-950/30",
    expired: "text-red-400 border-red-900/60 bg-red-950/30",
    missing: "text-gray-500 border-gray-700",
  };

  return (
    <span
      className={`inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${styles[status]}`}
      title={formatExpiryDate(expirationDate)}
    >
      {expiryStatusLabel(status, days)}
      {!compact && status !== "missing" && (
        <span className="normal-case font-normal text-gray-500 ml-1">
          ({formatExpiryDate(expirationDate)})
        </span>
      )}
    </span>
  );
}
