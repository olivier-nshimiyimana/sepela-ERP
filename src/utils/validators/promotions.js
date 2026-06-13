import { appError } from "../../i18n";
import {
  PROMOTION_DISCOUNT_TYPE,
  PROMOTION_TARGET_SCOPE,
} from "../../db/promotions";

function parseTime(value) {
  const ts = new Date(String(value ?? ""));
  return Number.isNaN(ts.getTime()) ? null : ts.getTime();
}

export function validatePromotionFields(fields, locale = "fr") {
  const name = String(fields.name ?? "").trim();
  if (!name) return { ok: false, error: appError("promotionNameRequired", locale) };

  const targetScope = fields.targetScope;
  if (targetScope === PROMOTION_TARGET_SCOPE.SPECIFIC_CATEGORY && !String(fields.categoryId ?? "").trim()) {
    return { ok: false, error: appError("promotionScopeTargetRequired", locale) };
  }
  if (targetScope === PROMOTION_TARGET_SCOPE.SPECIFIC_PRODUCT && !String(fields.productId ?? "").trim()) {
    return { ok: false, error: appError("promotionScopeTargetRequired", locale) };
  }

  const discountType = fields.discountType;
  const discountValue = Number(fields.discountValue);
  const discountFreeQty = Number(fields.discountFreeQty);

  if (discountType === PROMOTION_DISCOUNT_TYPE.BUY_X_GET_Y) {
    const buyQty = Math.floor(discountValue);
    const freeQty = Math.floor(discountFreeQty);
    if (!Number.isFinite(discountValue) || buyQty < 1 || buyQty !== discountValue) {
      return { ok: false, error: appError("promotionBuyQtyInvalid", locale) };
    }
    if (!Number.isFinite(discountFreeQty) || freeQty < 1 || freeQty !== discountFreeQty) {
      return { ok: false, error: appError("promotionFreeQtyInvalid", locale) };
    }
  } else {
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return { ok: false, error: appError("promotionDiscountInvalid", locale) };
    }
    if (discountType === PROMOTION_DISCOUNT_TYPE.PERCENTAGE && discountValue > 100) {
      return { ok: false, error: appError("promotionDiscountInvalid", locale) };
    }
  }

  const start = parseTime(fields.startDate);
  const end = parseTime(fields.endDate);
  if (start == null || end == null || start > end) {
    return { ok: false, error: appError("promotionDatesInvalid", locale) };
  }

  const minOrderAmount =
    fields.minOrderAmount == null || fields.minOrderAmount === ""
      ? null
      : Number(fields.minOrderAmount);
  if (minOrderAmount != null && (!Number.isFinite(minOrderAmount) || minOrderAmount < 0)) {
    return { ok: false, error: appError("promotionMinOrderInvalid", locale) };
  }

  return {
    ok: true,
    data: {
      id: fields.id ?? null,
      name,
      targetScope,
      categoryId: fields.categoryId ? String(fields.categoryId).trim() : null,
      productId: fields.productId ? String(fields.productId).trim() : null,
      discountType,
      discountValue:
        discountType === PROMOTION_DISCOUNT_TYPE.BUY_X_GET_Y
          ? Math.floor(discountValue)
          : discountValue,
      discountFreeQty:
        discountType === PROMOTION_DISCOUNT_TYPE.BUY_X_GET_Y
          ? Math.floor(discountFreeQty)
          : null,
      clientTier: String(fields.clientTier ?? "").trim() || null,
      minOrderAmount,
      startDate: new Date(start).toISOString(),
      endDate: new Date(end).toISOString(),
      isActive: fields.isActive !== false,
    },
  };
}

export function validateProductCategoryFields(fields, locale = "fr") {
  const name = String(fields.name ?? "").trim();
  const code = String(fields.code ?? "").trim();
  if (!name) return { ok: false, error: appError("categoryNameRequired", locale) };
  if (!code) return { ok: false, error: appError("categoryCodeRequired", locale) };
  return {
    ok: true,
    data: {
      id: fields.id ?? null,
      name,
      code,
    },
  };
}
