import {
  PROMOTION_DISCOUNT_TYPE,
  PROMOTION_TARGET_SCOPE,
} from "../db/promotions";

function parseTime(value) {
  const ts = new Date(String(value ?? ""));
  return Number.isNaN(ts.getTime()) ? null : ts.getTime();
}

/** End of the promotion's end calendar day (local) so same-day promos stay valid all day. */
function promotionEndInclusive(endDateIso) {
  const end = new Date(String(endDateIso ?? ""));
  if (Number.isNaN(end.getTime())) return null;
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

/** Live window + active toggle guard for offline POS evaluation. */
export function isPromotionLive(promotion, now = new Date()) {
  if (!promotion?.isActive) return false;
  const start = parseTime(promotion.startDate);
  const end = promotionEndInclusive(promotion.endDate);
  const current = now.getTime();
  if (start == null || end == null) return false;
  return current >= start && current <= end;
}

export function promotionMatchesCustomer(promotion, customer) {
  const requiredTier = String(promotion?.clientTier ?? "").trim();
  if (!requiredTier) return true;
  const actualTier = String(customer?.clientTier ?? customer?.client_tier ?? "").trim();
  return actualTier.toLowerCase() === requiredTier.toLowerCase();
}

function promotionUsesScopedMinOrder(promotion) {
  const scope = promotion?.targetScope;
  return (
    scope === PROMOTION_TARGET_SCOPE.SPECIFIC_PRODUCT ||
    scope === PROMOTION_TARGET_SCOPE.SPECIFIC_CATEGORY
  );
}

export function promotionMeetsMinOrder(
  promotion,
  cartSubtotalUsd,
  { cart = [], products = [] } = {}
) {
  const min = Number(promotion?.minOrderAmount);
  if (!Number.isFinite(min) || min <= 0) return true;

  const basis =
    promotionUsesScopedMinOrder(promotion) && cart.length && products.length
      ? promotionQualifyingSubtotalUsd(promotion, cart, products)
      : Number(cartSubtotalUsd);

  return basis >= min;
}

function normalizeProductName(name) {
  return String(name ?? "").trim().toLowerCase();
}

export function promotionAppliesToProduct(promotion, product, { productById, lineName } = {}) {
  const scope = promotion?.targetScope;
  if (scope === PROMOTION_TARGET_SCOPE.ALL_PRODUCTS) return true;
  if (scope === PROMOTION_TARGET_SCOPE.SPECIFIC_CATEGORY) {
    const categoryId = String(promotion?.categoryId ?? "").trim();
    const productCategoryId = String(product?.categoryId ?? product?.category_id ?? "").trim();
    return categoryId && categoryId === productCategoryId;
  }
  if (scope === PROMOTION_TARGET_SCOPE.SPECIFIC_PRODUCT) {
    const targetId = String(promotion?.productId ?? "").trim();
    if (!targetId) return false;

    const lineProductId = String(product?.id ?? "").trim();
    if (lineProductId && lineProductId === targetId) return true;

    const targetProduct = productById?.get?.(targetId);
    if (!targetProduct) return false;

    const targetName = normalizeProductName(targetProduct.name);
    const actualName = normalizeProductName(product?.name ?? lineName);
    return targetName && actualName === targetName;
  }
  return false;
}

/** Match a POS cart line (FEFO batches) to a specific-product or category promotion. */
export function promotionAppliesToCartLine(promotion, line, productById) {
  const scope = promotion?.targetScope;
  if (scope === PROMOTION_TARGET_SCOPE.ALL_PRODUCTS) return true;

  if (scope === PROMOTION_TARGET_SCOPE.SPECIFIC_CATEGORY) {
    const categoryId = String(promotion?.categoryId ?? "").trim();
    if (!categoryId) return false;

    const ids = new Set([line.productId, ...(line.allocations ?? []).map((a) => a.productId)]);
    for (const id of ids) {
      const product = productById.get(id);
      if (String(product?.categoryId ?? "").trim() === categoryId) return true;
    }
    return false;
  }

  if (scope === PROMOTION_TARGET_SCOPE.SPECIFIC_PRODUCT) {
    const targetId = String(promotion?.productId ?? "").trim();
    if (!targetId) return false;

    const target = productById.get(targetId);
    const targetName = normalizeProductName(target?.name);
    if (!targetName) return false;

    if (String(line.productId ?? "").trim() === targetId) return true;

    for (const allocation of line.allocations ?? []) {
      if (String(allocation.productId ?? "").trim() === targetId) return true;
      const batch = productById.get(allocation.productId);
      if (normalizeProductName(batch?.name) === targetName) return true;
    }

    const lineBatch = productById.get(line.productId);
    if (normalizeProductName(lineBatch?.name) === targetName) return true;
    if (normalizeProductName(line.name) === targetName) return true;

    return false;
  }

  return false;
}

export function promotionQualifyingSubtotalUsd(promotion, cart = [], products = []) {
  const productById = new Map(products.map((product) => [product.id, product]));
  return cartLinesForPromotionEval(cart)
    .filter((line) => promotionAppliesToCartLine(promotion, line, productById))
    .reduce((sum, line) => sum + lineSubtotalUsd(line), 0);
}

function lineSubtotalUsd(line) {
  const price = Number(line?.price ?? 0);
  const qty = Math.max(0, parseInt(line?.qty, 10) || 0);
  return price * qty;
}

function calcLineDiscountUsd(promotion, lineSubtotal) {
  const subtotal = Math.max(0, Number(lineSubtotal) || 0);
  if (subtotal <= 0) return 0;

  const value = Number(promotion.discountValue) || 0;
  if (promotion.discountType === PROMOTION_DISCOUNT_TYPE.PERCENTAGE) {
    const pct = Math.min(100, Math.max(0, value));
    return Math.min(subtotal, (subtotal * pct) / 100);
  }
  if (promotion.discountType === PROMOTION_DISCOUNT_TYPE.FIXED_AMOUNT) {
    return Math.min(subtotal, Math.max(0, value));
  }
  return 0;
}

/** Map FEFO cart lines to promotion-engine lines (product id from first allocation). */
export function cartLinesForPromotionEval(cart = []) {
  return cart.map((line) => ({
    id: line.id,
    name: line.name,
    productId: line.allocations?.[0]?.productId ?? line.id,
    price: line.price,
    qty: line.qty,
    allocations: line.allocations ?? [],
  }));
}

/**
 * Evaluate cart promotions offline at POS.
 * Returns per-line discounts and the best promotion applied per eligible line.
 */
export function evaluateCartPromotions({
  cart = [],
  products = [],
  promotions = [],
  customer = null,
  now = new Date(),
}) {
  const productById = new Map(products.map((product) => [product.id, product]));
  const cartSubtotalUsd = cart.reduce((sum, line) => sum + lineSubtotalUsd(line), 0);

  const evalLines = cartLinesForPromotionEval(cart);

  const eligiblePromotions = promotions.filter(
    (promotion) =>
      isPromotionLive(promotion, now) &&
      promotionMatchesCustomer(promotion, customer) &&
      promotionMeetsMinOrder(promotion, cartSubtotalUsd, { cart, products })
  );

  const lineResults = evalLines.map((line) => {
    const subtotal = lineSubtotalUsd(line);
    let best = null;

    for (const promotion of eligiblePromotions) {
      if (!promotionAppliesToCartLine(promotion, line, productById)) {
        continue;
      }
      const discountUSD = calcLineDiscountUsd(promotion, subtotal);
      if (!best || discountUSD > best.discountUSD) {
        best = {
          promotionId: promotion.id,
          promotionName: promotion.name,
          discountUSD,
          discountType: promotion.discountType,
          discountValue: promotion.discountValue,
        };
      }
    }

    return {
      lineId: line.id,
      productId: line.productId,
      subtotalUSD: subtotal,
      discountUSD: best?.discountUSD ?? 0,
      appliedPromotion: best,
    };
  });

  const totalDiscountUSD = lineResults.reduce((sum, row) => sum + row.discountUSD, 0);
  const appliedPromotionIds = [
    ...new Set(lineResults.map((row) => row.appliedPromotion?.promotionId).filter(Boolean)),
  ];

  return {
    cartSubtotalUSD: cartSubtotalUsd,
    totalDiscountUSD,
    totalAfterDiscountUSD: Math.max(0, cartSubtotalUsd - totalDiscountUSD),
    lineResults,
    appliedPromotionIds,
  };
}

/** Human-readable reason when a named promotion does not apply at checkout. */
export function explainPromotionBlocker(
  promotion,
  { cart = [], products = [], customer = null, cartSubtotalUsd = 0, now = new Date() } = {}
) {
  if (!promotion?.isActive) return "inactive";

  if (!isPromotionLive(promotion, now)) {
    return "not_live";
  }

  if (!promotionMatchesCustomer(promotion, customer)) {
    return "tier";
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const evalLines = cartLinesForPromotionEval(cart);
  const hasProductMatch = evalLines.some((line) =>
    promotionAppliesToCartLine(promotion, line, productById)
  );

  if (!hasProductMatch) {
    return "no_product";
  }

  if (!promotionMeetsMinOrder(promotion, cartSubtotalUsd, { cart, products })) {
    return "min_order";
  }

  return null;
}

function promotionRelevantToCart(promotion, cart, productById) {
  const scope = promotion?.targetScope;
  if (scope === PROMOTION_TARGET_SCOPE.ALL_PRODUCTS) return true;

  const evalLines = cartLinesForPromotionEval(cart);
  return evalLines.some((line) => promotionAppliesToCartLine(promotion, line, productById));
}

export function findCheckoutPromotionHint({
  promotions = [],
  cart = [],
  products = [],
  customer = null,
  cartSubtotalUsd = 0,
  now = new Date(),
}) {
  const productById = new Map(products.map((product) => [product.id, product]));

  for (const promotion of promotions) {
    if (!promotion?.isActive) continue;
    if (!promotionRelevantToCart(promotion, cart, productById)) continue;

    const reason = explainPromotionBlocker(promotion, {
      cart,
      products,
      customer,
      cartSubtotalUsd,
      now,
    });
    if (reason) {
      return { promotion, reason };
    }
  }
  return null;
}

/** Saved clients whose tier would unlock a cart-relevant promotion (no typing at checkout). */
export function findTierQuickPickCustomers({
  promotions = [],
  cart = [],
  products = [],
  customers = [],
  customer = null,
  cartSubtotalUsd = 0,
  now = new Date(),
}) {
  if (!cart.length || !customers.length) return [];

  const productById = new Map(products.map((product) => [product.id, product]));
  const tiersNeeded = new Set();

  for (const promotion of promotions) {
    const requiredTier = String(promotion?.clientTier ?? "").trim();
    if (!requiredTier) continue;
    if (!promotion?.isActive) continue;
    if (!promotionRelevantToCart(promotion, cart, productById)) continue;

    const reason = explainPromotionBlocker(promotion, {
      cart,
      products,
      customer: null,
      cartSubtotalUsd,
      now,
    });
    if (reason !== "tier") continue;

    const withoutTier = explainPromotionBlocker(promotion, {
      cart,
      products,
      customer: { clientTier: requiredTier },
      cartSubtotalUsd,
      now,
    });
    if (withoutTier) continue;

    tiersNeeded.add(requiredTier.toLowerCase());
  }

  if (!tiersNeeded.size) return [];

  const actualTier = String(customer?.clientTier ?? "").trim().toLowerCase();
  if (actualTier && tiersNeeded.has(actualTier)) return [];

  return customers.filter((row) => {
    const tier = String(row?.clientTier ?? "").trim().toLowerCase();
    return tier && tiersNeeded.has(tier);
  });
}

export function appliedPromotionLabels(promotions = [], appliedPromotionIds = []) {
  const idSet = new Set(appliedPromotionIds);
  return promotions.filter((promotion) => idSet.has(promotion.id)).map((promotion) => promotion.name);
}
