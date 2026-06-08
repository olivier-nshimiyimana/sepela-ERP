/** Line-item subtotal before promotion discounts. */
export function saleItemsSubtotalUsd(sale) {
  return (sale?.items ?? []).reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0),
    0
  );
}

/** Promotion discount stored on the sale, or inferred from subtotal vs total. */
export function salePromotionDiscountUsd(sale) {
  const stored = Number(sale?.promotionDiscountUSD);
  if (Number.isFinite(stored) && stored > 0) return stored;

  const subtotal = saleItemsSubtotalUsd(sale);
  const total = Number(sale?.totalUSD) || 0;
  const inferred = subtotal - total;
  return inferred > 0.001 ? inferred : 0;
}

export function saleAppliedPromotionName(sale, promotions = []) {
  const id = String(sale?.appliedPromotionId ?? "").trim();
  if (!id) return null;
  return promotions.find((row) => row.id === id)?.name ?? null;
}

export function saleHasPromotionDiscount(sale) {
  return salePromotionDiscountUsd(sale) > 0.001;
}
