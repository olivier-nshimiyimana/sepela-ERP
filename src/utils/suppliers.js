import { appError, DEFAULT_LOCALE } from "../i18n";

export function normalizeSupplierFields(fields = {}) {
  return {
    id: fields.id ?? null,
    name: String(fields.name ?? "").trim(),
    phone: String(fields.phone ?? "").trim() || null,
    address: String(fields.address ?? "").trim() || null,
  };
}

export function validateSupplierFields(fields = {}, locale = DEFAULT_LOCALE) {
  const data = normalizeSupplierFields(fields);
  if (!data.name) {
    return { ok: false, error: appError("supplierNameRequired", locale) };
  }
  return { ok: true, data };
}

export function supplierNameKey(name) {
  return String(name ?? "").trim().toLowerCase();
}

export function sortSuppliers(suppliers = []) {
  return [...suppliers].sort((a, b) => {
    const cmp = supplierNameKey(a.name).localeCompare(supplierNameKey(b.name));
    if (cmp !== 0) return cmp;
    return String(a.phone ?? "").localeCompare(String(b.phone ?? ""));
  });
}

export function findMatchingSupplier(suppliers = [], fields = {}) {
  const data = normalizeSupplierFields(fields);
  if (data.id) {
    return suppliers.find((supplier) => supplier.id === data.id) ?? null;
  }
  const key = supplierNameKey(data.name);
  if (!key) return null;
  return suppliers.find((supplier) => supplierNameKey(supplier.name) === key) ?? null;
}

export function validatePurchaseItems(items = [], products = [], locale = DEFAULT_LOCALE) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: appError("purchaseItemsRequired", locale) };
  }

  const productIds = new Set(products.map((product) => product.id));
  const normalized = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const qty = parseInt(item.qty, 10);
    const unitCost = parseFloat(item.unitCost);
    const productId = item.productId ?? "";
    const lotNumber = String(item.lotNumber ?? "").trim();
    const expirationDate = String(item.expirationDate ?? "").trim();
    const productName = String(item.productName ?? "").trim();

    if (!productId || !productIds.has(productId)) {
      return { ok: false, error: appError("purchaseLineProduct", locale, { line: i + 1 }) };
    }
    if (Number.isNaN(qty) || qty <= 0) {
      return { ok: false, error: appError("purchaseLineQty", locale, { line: i + 1 }) };
    }
    if (Number.isNaN(unitCost) || unitCost < 0) {
      return { ok: false, error: appError("purchaseLineCost", locale, { line: i + 1 }) };
    }
    if (!lotNumber || lotNumber.length < 2) {
      return { ok: false, error: appError("purchaseLineLot", locale, { line: i + 1 }) };
    }
    if (!expirationDate) {
      return { ok: false, error: appError("purchaseLineExpiry", locale, { line: i + 1 }) };
    }

    normalized.push({
      productId,
      productName,
      qty,
      unitCost,
      lotNumber,
      expirationDate,
      lineTotal: qty * unitCost,
    });
  }

  return { ok: true, items: normalized };
}
