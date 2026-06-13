import { lineTotalUsd, percentOfUsd, roundUsd, sumUsd } from "./moneyRounding";

export const CART_DISCOUNT_TYPE = {
  NONE: "none",
  PERCENTAGE: "percentage",
  FIXED: "fixed",
  BUY_X_GET_Y: "buy_x_get_y",
};

/** Free units earned for buy-X-get-Y-free (e.g. buy 5 get 1 → bundle of 6). */
export function buyXGetYFreeQty(qty, buyQty, freeQty) {
  const quantity = Math.max(0, parseInt(qty, 10) || 0);
  const buy = Math.max(0, parseInt(buyQty, 10) || 0);
  const free = Math.max(0, parseInt(freeQty, 10) || 0);
  if (quantity <= 0 || buy <= 0 || free <= 0) return 0;
  const bundleSize = buy + free;
  return Math.floor(quantity / bundleSize) * free;
}

export function buyXGetYPaidQty(qty, buyQty, freeQty) {
  const quantity = Math.max(0, parseInt(qty, 10) || 0);
  return quantity - buyXGetYFreeQty(quantity, buyQty, freeQty);
}

export function cartLineSubtotalUsd(line) {
  return lineTotalUsd(line?.price ?? 0, line?.qty ?? 0);
}

export function cartLineManualDiscountUsd(line) {
  const subtotal = cartLineSubtotalUsd(line);
  if (subtotal <= 0) return 0;

  const type = line?.discountType ?? CART_DISCOUNT_TYPE.NONE;
  const value = Number(line?.discountValue) || 0;

  if (type === CART_DISCOUNT_TYPE.PERCENTAGE) {
    const pct = Math.min(100, Math.max(0, value));
    return roundUsd(Math.min(subtotal, percentOfUsd(subtotal, pct)));
  }
  if (type === CART_DISCOUNT_TYPE.FIXED) {
    return roundUsd(Math.min(subtotal, Math.max(0, value)));
  }
  if (type === CART_DISCOUNT_TYPE.BUY_X_GET_Y) {
    const freeQty = Number(line?.discountFreeQty) || 0;
    const price = roundUsd(line?.price ?? 0);
    const qty = Math.max(0, parseInt(line?.qty, 10) || 0);
    return roundUsd(buyXGetYFreeQty(qty, value, freeQty) * price);
  }
  return 0;
}

export function cartLineNetUsd(line) {
  return roundUsd(Math.max(0, cartLineSubtotalUsd(line) - cartLineManualDiscountUsd(line)));
}

export function cartSubtotalGrossUsd(cart = []) {
  return sumUsd(cart.map(cartLineSubtotalUsd));
}

export function cartManualDiscountTotalUsd(cart = []) {
  return sumUsd(cart.map(cartLineManualDiscountUsd));
}

export function cartSubtotalNetUsd(cart = []) {
  return sumUsd(cart.map(cartLineNetUsd));
}

export function cartLineUnitCostUsd(line, products = []) {
  const allocations =
    line?.allocations?.length > 0
      ? line.allocations
      : [{ productId: line?.allocations?.[0]?.productId ?? line?.id, qty: line?.qty ?? 0 }];

  let costSum = 0;
  let qtySum = 0;
  for (const allocation of allocations) {
    const product = products.find((row) => row.id === allocation.productId);
    const unitCost = Number(product?.itemUnitCost ?? 0);
    const qty = Math.max(0, Number(allocation.qty) || 0);
    costSum += unitCost * qty;
    qtySum += qty;
  }
  return qtySum > 0 ? costSum / qtySum : 0;
}

/**
 * Lines whose effective unit sell price (after manual + optional promo share) is below cost.
 */
export function findBelowCostLineNames(
  cart = [],
  products = [],
  { promotionDiscountUSD = 0, cartNetSubtotal } = {}
) {
  const netSubtotal = cartNetSubtotal ?? cartSubtotalNetUsd(cart);
  const names = [];

  for (const line of cart) {
    const lineNet = cartLineNetUsd(line);
    let finalLineNet = lineNet;
    if (promotionDiscountUSD > 0 && netSubtotal > 0) {
      finalLineNet = roundUsd(Math.max(0, lineNet - (lineNet / netSubtotal) * promotionDiscountUSD));
    }
    const qty = Math.max(1, Number(line.qty) || 1);
    const unitSell = finalLineNet / qty;
    const unitCost = cartLineUnitCostUsd(line, products);
    if (unitCost > 0.0001 && unitSell + 0.0001 < unitCost) {
      names.push(String(line.name ?? "").trim() || "—");
    }
  }

  return [...new Set(names.filter(Boolean))];
}

const EMPTY_DISCOUNT = {
  discountType: CART_DISCOUNT_TYPE.NONE,
  discountValue: 0,
  discountFreeQty: 0,
};

export function normalizeCartDiscountFields(line = {}) {
  const type = line.discountType ?? CART_DISCOUNT_TYPE.NONE;
  const value = Number(line.discountValue) || 0;
  const freeQty = Number(line.discountFreeQty) || 0;

  if (type === CART_DISCOUNT_TYPE.NONE) {
    return { ...EMPTY_DISCOUNT };
  }
  if (type === CART_DISCOUNT_TYPE.PERCENTAGE) {
    if (value <= 0) return { ...EMPTY_DISCOUNT };
    return {
      discountType: CART_DISCOUNT_TYPE.PERCENTAGE,
      discountValue: Math.min(100, Math.max(0, value)),
      discountFreeQty: 0,
    };
  }
  if (type === CART_DISCOUNT_TYPE.FIXED) {
    if (value <= 0) return { ...EMPTY_DISCOUNT };
    const max = cartLineSubtotalUsd(line);
    return {
      discountType: CART_DISCOUNT_TYPE.FIXED,
      discountValue: Math.min(max, Math.max(0, value)),
      discountFreeQty: 0,
    };
  }
  if (type === CART_DISCOUNT_TYPE.BUY_X_GET_Y) {
    if (value <= 0 || freeQty <= 0) return { ...EMPTY_DISCOUNT };
    return {
      discountType: CART_DISCOUNT_TYPE.BUY_X_GET_Y,
      discountValue: Math.max(1, Math.floor(value)),
      discountFreeQty: Math.max(1, Math.floor(freeQty)),
    };
  }
  return { ...EMPTY_DISCOUNT };
}

export function validateCartDiscountInput(type, value, line, { freeQty } = {}) {
  const subtotal = cartLineSubtotalUsd(line);
  if (type === CART_DISCOUNT_TYPE.NONE) {
    return { ok: true, data: { ...EMPTY_DISCOUNT } };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, error: "pos.discountInvalid" };
  }
  if (type === CART_DISCOUNT_TYPE.PERCENTAGE) {
    if (parsed <= 0 || parsed > 100) return { ok: false, error: "pos.discountPercentRange" };
    return {
      ok: true,
      data: { discountType: type, discountValue: parsed, discountFreeQty: 0 },
    };
  }
  if (type === CART_DISCOUNT_TYPE.FIXED) {
    if (parsed <= 0) return { ok: false, error: "pos.discountFixedPositive" };
    if (parsed > subtotal) return { ok: false, error: "pos.discountExceedsLine" };
    return {
      ok: true,
      data: { discountType: type, discountValue: parsed, discountFreeQty: 0 },
    };
  }
  if (type === CART_DISCOUNT_TYPE.BUY_X_GET_Y) {
    const buy = Math.floor(parsed);
    const free = Math.floor(Number(freeQty));
    if (buy <= 0) return { ok: false, error: "pos.discountBuyQtyInvalid" };
    if (free <= 0) return { ok: false, error: "pos.discountFreeQtyInvalid" };
    return {
      ok: true,
      data: {
        discountType: type,
        discountValue: buy,
        discountFreeQty: free,
      },
    };
  }
  return { ok: false, error: "pos.discountInvalid" };
}

export function cartLineHasDiscount(line) {
  return cartLineManualDiscountUsd(line) > 0.001;
}

export function cartLineDiscountSummaryKey(line) {
  if (line?.discountType !== CART_DISCOUNT_TYPE.BUY_X_GET_Y) return null;
  const freeCount = buyXGetYFreeQty(line.qty, line.discountValue, line.discountFreeQty);
  return freeCount > 0 ? "pos.discountBuyXGetYActive" : "pos.discountBuyXGetYRule";
}

export function cartLineDiscountSummaryParams(line) {
  if (line?.discountType === CART_DISCOUNT_TYPE.BUY_X_GET_Y) {
    return {
      buy: line.discountValue,
      free: line.discountFreeQty,
      count: buyXGetYFreeQty(line.qty, line.discountValue, line.discountFreeQty),
    };
  }
  return {};
}
