import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatDualCurrency } from "../utils/currency";
import { useLocale } from "../contexts/LocaleContext";

function CartQtyInput({ item, maxStock, onSetQty }) {
  const [draft, setDraft] = useState(null);
  const display = draft !== null ? draft : String(item.qty);

  const commit = () => {
    const raw = draft !== null ? draft : String(item.qty);
    setDraft(null);
    onSetQty(item.id, raw);
  };

  return (
    <input
      type="number"
      min={1}
      max={maxStock}
      inputMode="numeric"
      aria-label={`Quantity for ${item.name}`}
      className="w-12 h-7 text-center font-mono text-sm bg-[#0a0a0a] border border-gray-700 rounded focus:border-blue-500 outline-none"
      value={display}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export default function CartTable({
  cart,
  exchangeRate,
  primaryCurrency,
  onIncrement,
  onDecrement,
  onSetQty,
  onRemove,
}) {
  const { t } = useLocale();

  if (cart.length === 0) {
    return (
      <p className="text-center text-gray-600 text-sm py-12">{t("pos.cartEmpty")}</p>
    );
  }

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="text-gray-500 uppercase text-[10px] tracking-widest border-b border-gray-800">
          <th className="pb-2">{t("common.product")}</th>
          <th className="pb-2">{t("common.qty")}</th>
          <th className="pb-2 text-right">{t("common.total")}</th>
          <th className="pb-2 w-28" />
        </tr>
      </thead>
      <tbody>
        {cart.map((item) => {
          const maxStock = item.stock ?? item.qty;
          const allocations = item.allocations ?? [];

          return (
            <tr key={item.id} className="border-b border-gray-900">
              <td className="py-3">
                <span className="font-medium text-gray-300 block">{item.name}</span>
                {allocations.length > 0 && (
                  <span className="mt-1 block space-y-1">
                    {allocations.map((allocation, index) => (
                      <span
                        key={`${allocation.productId}-${index}`}
                        className="block text-[10px] font-mono text-gray-600"
                      >
                        {t("pos.batch", { n: index + 1 })}: x{allocation.qty}
                        {allocation.lotNumber ? ` · ${t("pos.lot")} ${allocation.lotNumber}` : ""}
                        {allocation.expirationDate ? ` · ${t("pos.exp")} ${allocation.expirationDate}` : ""}
                      </span>
                    ))}
                  </span>
                )}
              </td>
              <td className="py-3">
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onDecrement(item.id)}
                    className="p-1 rounded border border-gray-700 hover:border-blue-500 text-gray-400 hover:text-white"
                    aria-label={`Decrease ${item.name}`}
                  >
                    <Minus size={14} />
                  </button>
                  <CartQtyInput item={item} maxStock={maxStock} onSetQty={onSetQty} />
                  <button
                    type="button"
                    onClick={() => onIncrement(item.id)}
                    className="p-1 rounded border border-gray-700 hover:border-blue-500 text-gray-400 hover:text-white"
                    aria-label={`Increase ${item.name}`}
                  >
                    <Plus size={14} />
                  </button>
                </span>
              </td>
              <td className="py-3 text-right font-bold text-blue-400">
                {formatDualCurrency(item.price * item.qty, exchangeRate, primaryCurrency).primary}
              </td>
              <td className="py-3 text-right">
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="p-1.5 rounded text-red-500 hover:bg-red-950/50"
                  aria-label={`Remove ${item.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
