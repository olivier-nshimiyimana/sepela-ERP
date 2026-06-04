import { useState } from "react";
import { RotateCcw, X } from "lucide-react";

const Box = "d" + "iv";

export default function RefundConfirmModal({ isOpen, sale, onClose, onConfirm }) {
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
    <Box className="absolute inset-0 z-[65] flex items-center justify-center bg-black/90 p-4">
      <Box className="bg-[#1a1a1a] border border-red-900/50 w-full max-w-md rounded-xl shadow-2xl p-6 space-y-4">
        <Box className="flex justify-between items-start">
          <h3 className="font-bold flex items-center gap-2 text-red-400">
            <RotateCcw size={20} />
            Refund invoice
          </h3>
          <button type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </Box>
        <p className="text-sm text-gray-400">
          Refund <span className="font-mono text-white font-bold">{sale.invoiceNumber ?? sale.id.slice(-10)}</span> for{" "}
          <span className="text-white">${(sale.totalUSD ?? 0).toFixed(2)}</span> USD. This marks the
          sale as refunded in your records (cash handling is manual at the register).
        </p>
        <Box className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase">Reason</label>
          <textarea
            className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg p-3 text-sm min-h-[80px] focus:border-red-500 outline-none"
            placeholder="Customer return, pricing error, duplicate charge…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Box>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={restoreStock}
            onChange={(e) => setRestoreStock(e.target.checked)}
            className="rounded border-gray-600"
          />
          Return quantities to inventory (recommended for product refunds)
        </label>
        <Box className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-lg border border-gray-700 text-sm font-bold uppercase"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="flex-1 py-3 rounded-lg bg-red-700 hover:bg-red-600 text-sm font-black uppercase"
          >
            Confirm refund
          </button>
        </Box>
      </Box>
    </Box>
  );
}
