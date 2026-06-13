import { lineTotalUsd, roundUsd, sumUsd } from "./moneyRounding";

/** Line-item subtotal before promotion discounts. */
export function saleItemsSubtotalUsd(sale) {
  return sumUsd(
    (sale?.items ?? []).map((item) => lineTotalUsd(item.price, item.qty))
  );
}

/** Manual line/cart discount stored on the sale. */
export function saleManualDiscountUsd(sale) {
  const stored = Number(sale?.manualDiscountUSD);
  if (Number.isFinite(stored) && stored > 0) return roundUsd(stored);
  return 0;
}

/** Gross subtotal before manual discounts (sale items are stored at net unit price). */
export function saleGrossSubtotalUsd(sale) {
  return saleItemsSubtotalUsd(sale) + saleManualDiscountUsd(sale);
}

/** Promotion discount stored on the sale, or inferred from subtotal vs total. */
export function salePromotionDiscountUsd(sale) {
  const stored = Number(sale?.promotionDiscountUSD);
  if (Number.isFinite(stored) && stored > 0) return roundUsd(stored);

  if (saleManualDiscountUsd(sale) > 0.001) return 0;

  const subtotal = saleItemsSubtotalUsd(sale);
  const total = roundUsd(sale?.totalUSD);
  const inferred = roundUsd(subtotal - total);
  return inferred > 0.001 ? inferred : 0;
}

export function saleHasManualDiscount(sale) {
  return saleManualDiscountUsd(sale) > 0.001;
}

export function saleAppliedPromotionName(sale, promotions = []) {
  const id = String(sale?.appliedPromotionId ?? "").trim();
  if (!id) return null;
  return promotions.find((row) => row.id === id)?.name ?? null;
}

export function saleHasPromotionDiscount(sale) {
  return salePromotionDiscountUsd(sale) > 0.001;
}
