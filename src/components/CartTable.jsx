import { useState } from "react";
import { Minus, Plus, Tag, Trash2 } from "lucide-react";
import { formatDualCurrency } from "../utils/currency";
import {
  CART_DISCOUNT_TYPE,
  cartLineDiscountSummaryKey,
  cartLineDiscountSummaryParams,
  cartLineNetUsd,
  cartLineManualDiscountUsd,
  cartLineSubtotalUsd,
} from "../utils/cartDiscount";
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
      className="pos-qty-input text-center font-mono"
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
  onDiscount,
  showDiscount = false,
}) {
  const { t } = useLocale();

  if (cart.length === 0) {
    return (
      <p className="text-center text-sepela-muted text-base font-semibold py-12">{t("pos.cartEmpty")}</p>
    );
  }

  return (
    <table className="w-full text-left pos-cart-head">
      <thead>
        <tr>
          <th>{t("common.product")}</th>
          <th>{t("common.qty")}</th>
          <th className="text-right">{t("common.total")}</th>
          <th className="w-36" />
        </tr>
      </thead>
      <tbody>
        {cart.map((item) => {
          const maxStock = item.stock ?? item.qty;
          const allocations = item.allocations ?? [];
          const lineDiscount = cartLineManualDiscountUsd(item);
          const lineNet = cartLineNetUsd(item);
          const lineGross = cartLineSubtotalUsd(item);
          const lineDual = formatDualCurrency(lineNet, exchangeRate, primaryCurrency);
          const grossDual = formatDualCurrency(lineGross, exchangeRate, primaryCurrency);

          return (
            <tr key={item.id} className="pos-cart-row shadow-[inset_0_-1px_0_#383838]">
              <td className="py-4">
                <span className="pos-line-name block">{item.name}</span>
                {item.discountType === CART_DISCOUNT_TYPE.BUY_X_GET_Y &&
                item.discountValue > 0 &&
                item.discountFreeQty > 0 ? (
                  <span className="sepela-badge mt-1 block text-amber-400">
                    {t(cartLineDiscountSummaryKey(item) ?? "pos.discountBuyXGetYRule", cartLineDiscountSummaryParams(item))}
                  </span>
                ) : null}
                {allocations.length > 0 && (
                  <span className="mt-1.5 block space-y-1">
                    {allocations.map((allocation, index) => (
                      <span
                        key={`${allocation.productId}-${index}`}
                        className="pos-line-meta block font-mono"
                      >
                        {t("pos.batch", { n: index + 1 })}: x{allocation.qty}
                        {allocation.lotNumber ? ` · ${t("pos.lot")} ${allocation.lotNumber}` : ""}
                        {allocation.expirationDate ? ` · ${t("pos.exp")} ${allocation.expirationDate}` : ""}
                      </span>
                    ))}
                  </span>
                )}
              </td>
              <td className="py-3.5">
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onDecrement(item.id)}
                    className="pos-qty-btn border border-sepela-border hover:border-sepela-accent text-sepela-muted hover:text-white"
                    aria-label={`Decrease ${item.name}`}
                  >
                    <Minus size={16} />
                  </button>
                  <CartQtyInput item={item} maxStock={maxStock} onSetQty={onSetQty} />
                  <button
                    type="button"
                    onClick={() => onIncrement(item.id)}
                    className="pos-qty-btn border border-sepela-border hover:border-sepela-accent text-sepela-muted hover:text-white"
                    aria-label={`Increase ${item.name}`}
                  >
                    <Plus size={16} />
                  </button>
                </span>
              </td>
              <td className="py-4 text-right pos-line-total sepela-money">
                {lineDiscount > 0.001 ? (
                  <span className="block">
                    <span className="block text-xs text-sepela-muted line-through font-semibold">
                      {grossDual.primary}
                    </span>
                    <span>{lineDual.primary}</span>
                  </span>
                ) : (
                  lineDual.primary
                )}
              </td>
              <td className="py-3.5 text-right">
                <span className="inline-flex items-center gap-1.5">
                  {showDiscount ? (
                    <button
                      type="button"
                      onClick={() => onDiscount?.(item)}
                      className={`p-2 rounded-sm border ${
                        lineDiscount > 0.001 ||
                        item.discountType === CART_DISCOUNT_TYPE.BUY_X_GET_Y
                          ? "border-amber-600 text-amber-400 bg-amber-950/30"
                          : "border-sepela-border text-sepela-muted hover:border-amber-600 hover:text-amber-400"
                      }`}
                      aria-label={`${t("pos.discount")} ${item.name}`}
                      title={t("pos.discount")}
                    >
                      <Tag size={16} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="p-2 rounded-sm text-red-400 hover:bg-red-950/50"
                    aria-label={`Remove ${item.name}`}
                  >
                    <Trash2 size={18} />
                  </button>
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
