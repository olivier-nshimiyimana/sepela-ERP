import { appError, DEFAULT_LOCALE } from "../i18n";
import { parseExpiryDate } from "../utils/productExpiry";
import { normalizeInventoryBreakdown } from "../utils/inventoryBreakdown";

function defaultExpiry(yearsAhead = 1) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + yearsAhead);
  return d.toISOString().slice(0, 10);
}

function withDefaults(product) {
  const stockQty = Math.max(
    0,
    parseInt(product.stockQuantityItems ?? product.stock, 10) || 0
  );
  const breakdown = normalizeInventoryBreakdown(product, stockQty);
  return {
    ...product,
    ...breakdown,
    stock: breakdown.stockQuantityItems,
    lotNumber: product.lotNumber?.trim() || "",
    expirationDate: product.expirationDate || defaultExpiry(),
  };
}

export function normalizeProducts(products) {
  return products.map(withDefaults);
}

export function validateProductFields(fields, locale = DEFAULT_LOCALE) {
  const {
    name,
    lotNumber,
    expirationDate,
    price,
    stock,
    stockQuantityItems,
    buyUnit,
    buyUnitCost,
    qtyPerUnit,
    itemSizeLabel,
    reorderLevelItems,
  } = fields ?? {};

  const trimmedName = name?.trim();
  const trimmedLot = lotNumber?.trim();

  if (!trimmedName) {
    return { ok: false, error: appError("productNameRequired", locale) };
  }
  if (!trimmedLot || trimmedLot.length < 2) {
    return { ok: false, error: appError("lotRequired", locale) };
  }
  if (!parseExpiryDate(expirationDate)) {
    return { ok: false, error: appError("expirationInvalid", locale) };
  }

  const parsedPrice = parseFloat(price);
  const stockRaw = stockQuantityItems ?? stock;
  const parsedStock = parseInt(stockRaw, 10);
  if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
    return { ok: false, error: appError("priceInvalid", locale) };
  }
  if (Number.isNaN(parsedStock) || parsedStock < 0) {
    return { ok: false, error: appError("stockInvalid", locale) };
  }

  const parsedQtyPerUnit = parseInt(qtyPerUnit, 10);
  if (qtyPerUnit != null && qtyPerUnit !== "" && (Number.isNaN(parsedQtyPerUnit) || parsedQtyPerUnit < 1)) {
    return { ok: false, error: appError("qtyPerUnitInvalid", locale) };
  }

  const parsedBuyCost = buyUnitCost != null && buyUnitCost !== "" ? parseFloat(buyUnitCost) : 0;
  if (Number.isNaN(parsedBuyCost) || parsedBuyCost < 0) {
    return { ok: false, error: appError("buyCostInvalid", locale) };
  }

  const parsedReorder = reorderLevelItems != null && reorderLevelItems !== ""
    ? parseInt(reorderLevelItems, 10)
    : 0;
  if (Number.isNaN(parsedReorder) || parsedReorder < 0) {
    return { ok: false, error: appError("reorderInvalid", locale) };
  }

  const breakdown = normalizeInventoryBreakdown(
    {
      buyUnit,
      buyUnitCost: parsedBuyCost,
      qtyPerUnit: parsedQtyPerUnit || 1,
      itemSizeLabel,
      stockQuantityItems: parsedStock,
      reorderLevelItems: parsedReorder,
    },
    parsedStock
  );

  return {
    ok: true,
    data: {
      name: trimmedName,
      lotNumber: trimmedLot,
      expirationDate,
      price: parsedPrice,
      stock: breakdown.stockQuantityItems,
      ...breakdown,
    },
  };
}
