function batchValue(value) {
  return String(value ?? "").trim();
}

function batchName(value) {
  return batchValue(value).toLowerCase();
}

export function productBatchKey(fields = {}) {
  return [
    batchName(fields.name),
    batchName(fields.lotNumber),
    batchValue(fields.expirationDate),
  ].join("\0");
}

export function isSameProductBatch(left = {}, right = {}) {
  return productBatchKey(left) === productBatchKey(right);
}

export function findMatchingProductBatch(products = [], fields = {}, { excludeId = null } = {}) {
  const key = productBatchKey(fields);
  if (!key.replace(/\0/g, "")) return null;
  return (
    products.find((product) => {
      if (excludeId && product.id === excludeId) return false;
      return productBatchKey(product) === key;
    }) ?? null
  );
}

export function sortProductsForCatalog(products = []) {
  return [...products].sort((a, b) => {
    const nameCmp = batchName(a.name).localeCompare(batchName(b.name));
    if (nameCmp !== 0) return nameCmp;
    const expiryCmp = batchValue(a.expirationDate).localeCompare(batchValue(b.expirationDate));
    if (expiryCmp !== 0) return expiryCmp;
    const lotCmp = batchName(a.lotNumber).localeCompare(batchName(b.lotNumber));
    if (lotCmp !== 0) return lotCmp;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

export function resolveBatchTarget(products = [], productId, lotNumber, expirationDate) {
  const sourceProduct = products.find((product) => product.id === productId);
  if (!sourceProduct) {
    return { ok: false, error: "Product batch not found." };
  }

  const nextLotNumber = batchValue(lotNumber) || batchValue(sourceProduct.lotNumber);
  const nextExpirationDate = batchValue(expirationDate) || batchValue(sourceProduct.expirationDate);
  const requestedBatch = {
    name: sourceProduct.name,
    lotNumber: nextLotNumber,
    expirationDate: nextExpirationDate,
  };

  if (isSameProductBatch(sourceProduct, requestedBatch)) {
    return {
      ok: true,
      sourceProduct,
      targetProduct: sourceProduct,
      lotNumber: nextLotNumber,
      expirationDate: nextExpirationDate,
      createNew: false,
    };
  }

  const matchedBatch = findMatchingProductBatch(products, requestedBatch, {
    excludeId: sourceProduct.id,
  });

  if (matchedBatch) {
    return {
      ok: true,
      sourceProduct,
      targetProduct: matchedBatch,
      lotNumber: nextLotNumber,
      expirationDate: nextExpirationDate,
      createNew: false,
    };
  }

  return {
    ok: true,
    sourceProduct,
    targetProduct: null,
    lotNumber: nextLotNumber,
    expirationDate: nextExpirationDate,
    createNew: true,
  };
}
