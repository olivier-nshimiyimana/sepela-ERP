import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useCurrency } from "../contexts/CurrencyContext";
import { useLocale } from "../contexts/LocaleContext";
import { saleExchangeRate } from "../utils/currency";
import SepelaModal from "./SepelaModal";

const Box = "d" + "iv";

export default function RefundConfirmModal({ isOpen, sale, onClose, onConfirm }) {
  const currency = useCurrency();
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const [restoreStock, setRestoreStock] = useState(true);

  if (!isOpen || !sale) return null;

  const submit = () => {
    onConfirm({
      saleId: sale.id,
      reason,
      restoreStock,
    });
    setReason("");
    setRestoreStock(true);
  };

  return (
    <SepelaModal
      isOpen={isOpen}
      onClose={onClose}
      title={t("refund.title")}
      icon={RotateCcw}
      iconClassName="text-red-400"
      inset
      maxWidth="max-w-md"
      zClass="z-[65]"
      bodyClassName=""
    >
      <Box className="sepela-modal-body space-y-4">
        <p className="text-sm text-sepela-muted font-semibold">
          {t("refund.description", {
            invoice: sale.invoiceNumber ?? sale.id.slice(-10),
            amount: currency.formatPrimary(sale.totalUSD ?? 0, saleExchangeRate(sale)),
            currency: currency.primaryCurrency,
          })}
        </p>
        <Box className="sepela-field">
          <label className="sepela-label">{t("refund.reason")}</label>
          <textarea
            className="sepela-input min-h-[80px]"
            placeholder={t("refund.reasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Box>
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input
            type="checkbox"
            className="sepela-checkbox"
            checked={restoreStock}
            onChange={(e) => setRestoreStock(e.target.checked)}
          />
          {t("refund.restoreStock")}
        </label>
      </Box>
      <Box className="sepela-modal-footer flex gap-2">
        <button type="button" onClick={onClose} className="sepela-btn-secondary flex-1">
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={submit}
          className="sepela-btn-secondary sepela-btn-danger flex-1"
        >
          {t("refund.confirm")}
        </button>
      </Box>
    </SepelaModal>
  );
}
