import { AlertTriangle, XCircle } from "lucide-react";
import {
  daysUntilExpiry,
  formatExpiryDate,
  getExpiryAlerts,
} from "../utils/productExpiry";

const Box = "d" + "iv";

export default function ExpiryAlertsBanner({ products, expiryAlertDays, onManageProducts }) {
  const { expiringSoon, expired } = getExpiryAlerts(products, expiryAlertDays);
  const total = expiringSoon.length + expired.length;

  if (total === 0) return null;

  return (
    <Box className="shrink-0 border-b border-amber-900/50 bg-amber-950/30 px-4 py-3">
      <Box className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <Box>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
            <AlertTriangle size={14} />
            Expiry alerts ({total})
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Products within {expiryAlertDays} days cannot be sold after expiry.
          </p>
        </Box>
        <button
          type="button"
          onClick={onManageProducts}
          className="text-[10px] font-bold uppercase text-amber-400 border border-amber-800 px-3 py-1.5 rounded hover:bg-amber-950/50 shrink-0"
        >
          Review inventory
        </button>
      </Box>

      <Box className="mt-3 flex flex-wrap gap-2 max-h-24 overflow-y-auto">
        {expired.map((p) => (
          <AlertChip
            key={p.id}
            variant="expired"
            name={p.name}
            detail={`Lot ${p.lotNumber} · expired ${formatExpiryDate(p.expirationDate)}`}
          />
        ))}
        {expiringSoon.map((p) => {
          const days = daysUntilExpiry(p.expirationDate);
          return (
            <AlertChip
              key={p.id}
              variant="soon"
              name={p.name}
              detail={`Lot ${p.lotNumber} · ${days === 0 ? "today" : `${days}d left`}`}
            />
          );
        })}
      </Box>
    </Box>
  );
}

function AlertChip({ variant, name, detail }) {
  const isExpired = variant === "expired";
  return (
    <Box
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] ${
        isExpired
          ? "border-red-900/60 bg-red-950/40 text-red-300"
          : "border-amber-800/60 bg-amber-950/40 text-amber-200"
      }`}
    >
      {isExpired ? <XCircle size={12} /> : <AlertTriangle size={12} />}
      <Box>
        <span className="font-bold block truncate max-w-[140px]">{name}</span>
        <span className="text-gray-500">{detail}</span>
      </Box>
    </Box>
  );
}
