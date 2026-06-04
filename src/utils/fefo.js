import { isProductSellable, parseExpiryDate } from "./productExpiry";

function normalizePrice(price) {
  return Number.parseFloat(price ?? 0).toFixed(2);
}

function familyName(name) {
  return String(name ?? "").trim().toLowerCase();
}

function batchSortValue(product) {
  const parsed = parseExpiryDate(product.expirationDate);
  return parsed ? parsed.getTime() : Number.MAX_SAFE_INTEGER;
}

export function productFamilyKey(fields = {}) {
  return `${familyName(fields.name)}\0${normalizePrice(fields.price)}`;
}

function sameFamily(product, reference) {
  return productFamilyKey(product) === productFamilyKey(reference);
}

export function sortFefoBatches(products = []) {
  return [...products].sort((a, b) => {
    const expiryCmp = batchSortValue(a) - batchSortValue(b);
    if (expiryCmp !== 0) return expiryCmp;
    const lotCmp = String(a.lotNumber ?? "").localeCompare(String(b.lotNumber ?? ""));
    if (lotCmp !== 0) return lotCmp;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

function reservedQtyForProduct(cart = [], productId, excludeLineId = null) {
  return cart.reduce((sum, line) => {
    if (excludeLineId && line.id === excludeLineId) return sum;
    return (
      sum +
      (line.allocations ?? []).reduce(
        (lineSum, allocation) =>
          lineSum + (allocation.productId === productId ? allocation.qty ?? 0 : 0),
        0
      )
    );
  }, 0);
}

export function getFefoAvailability({
  products = [],
  cart = [],
  reference,
  alertDays,
  excludeLineId = null,
}) {
  const familyProducts = sortFefoBatches(products.filter((product) => sameFamily(product, reference)));
  const availableBatches = familyProducts
    .map((product) => {
      const reserved = reservedQtyForProduct(cart, product.id, excludeLineId);
      const available = Math.max(0, (product.stock ?? 0) - reserved);
      return { ...product, available };
    })
    .filter((product) => product.available > 0 && isProductSellable(product, alertDays));

  return {
    familyProducts,
    availableBatches,
    totalAvailable: availableBatches.reduce((sum, product) => sum + product.available, 0),
    primaryBatch: availableBatches[0] ?? familyProducts[0] ?? null,
  };
}

export function buildFefoCartLine({
  products = [],
  cart = [],
  reference,
  qty,
  alertDays,
  excludeLineId = null,
}) {
  const parsedQty = parseInt(qty, 10);
  if (Number.isNaN(parsedQty) || parsedQty <= 0) {
    return { ok: false, error: "Quantity must be at least 1." };
  }

  const availability = getFefoAvailability({
    products,
    cart,
    reference,
    alertDays,
    excludeLineId,
  });

  if (availability.availableBatches.length === 0 || availability.totalAvailable <= 0) {
    return { ok: false, error: `No sellable stock available for ${reference.name}.` };
  }

  if (parsedQty > availability.totalAvailable) {
    return {
      ok: false,
      error: `Only ${availability.totalAvailable} in stock for ${reference.name}.`,
      available: availability.totalAvailable,
    };
  }

  let remaining = parsedQty;
  const allocations = [];
  for (const batch of availability.availableBatches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.available, remaining);
    if (take <= 0) continue;
    allocations.push({
      productId: batch.id,
      lotNumber: batch.lotNumber,
      expirationDate: batch.expirationDate,
      qty: take,
    });
    remaining -= take;
  }

  const firstAllocation = allocations[0];
  return {
    ok: true,
    line: {
      id: productFamilyKey(reference),
      name: reference.name,
      price: reference.price,
      qty: parsedQty,
      stock: availability.totalAvailable,
      lotNumber: firstAllocation?.lotNumber ?? "",
      expirationDate: firstAllocation?.expirationDate ?? "",
      batchCount: allocations.length,
      allocations,
    },
  };
}

export function buildFefoCatalog(products = [], cart = [], alertDays) {
  const families = new Map();

  for (const product of products) {
    const key = productFamilyKey(product);
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(product);
  }

  return [...families.entries()]
    .map(([key, familyProducts]) => {
      const availability = getFefoAvailability({
        products: familyProducts,
        cart,
        reference: familyProducts[0],
        alertDays,
      });
      const primary = availability.primaryBatch ?? familyProducts[0];
      return {
        id: key,
        name: familyProducts[0].name,
        price: familyProducts[0].price,
        stock: availability.totalAvailable,
        lotNumber: familyProducts.map((product) => product.lotNumber).filter(Boolean).join(" "),
        displayLotNumber: primary?.lotNumber ?? "",
        expirationDate: primary?.expirationDate ?? "",
        batchCount: familyProducts.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.price - b.price);
}

export function expandCartToSaleItems(cart = []) {
  return cart.flatMap((line) => {
    const allocations = line.allocations?.length
      ? line.allocations
      : [
          {
            productId: line.id,
            lotNumber: line.lotNumber,
            expirationDate: line.expirationDate,
            qty: line.qty,
          },
        ];

    return allocations.map((allocation) => ({
      productId: allocation.productId,
      name: line.name,
      lotNumber: allocation.lotNumber,
      expirationDate: allocation.expirationDate,
      price: line.price,
      qty: allocation.qty,
    }));
  });
}
