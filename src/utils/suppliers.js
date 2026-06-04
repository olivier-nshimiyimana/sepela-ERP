export function normalizeSupplierFields(fields = {}) {
  return {
    id: fields.id ?? null,
    name: String(fields.name ?? "").trim(),
    phone: String(fields.phone ?? "").trim() || null,
    address: String(fields.address ?? "").trim() || null,
  };
}

export function validateSupplierFields(fields = {}) {
  const data = normalizeSupplierFields(fields);
  if (!data.name) {
    return { ok: false, error: "Supplier name is required." };
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

export function validatePurchaseItems(items = [], products = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Add at least one purchase item." };
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
      return { ok: false, error: `Line ${i + 1}: choose a valid product.` };
    }
    if (Number.isNaN(qty) || qty <= 0) {
      return { ok: false, error: `Line ${i + 1}: quantity must be greater than zero.` };
    }
    if (Number.isNaN(unitCost) || unitCost < 0) {
      return { ok: false, error: `Line ${i + 1}: unit cost must be zero or more.` };
    }
    if (!lotNumber || lotNumber.length < 2) {
      return { ok: false, error: `Line ${i + 1}: lot number is required.` };
    }
    if (!expirationDate) {
      return { ok: false, error: `Line ${i + 1}: expiration date is required.` };
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
