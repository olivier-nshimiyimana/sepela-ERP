import { useCallback, useMemo } from "react";
import { normalizeProducts, validateProductFields } from "../data/defaultProducts";
import { useLocalStorage } from "./useLocalStorage";

function nextProductId(products) {
  return products.reduce((max, p) => Math.max(max, p.id), 0) + 1;
}

export function useProducts() {
  const [rawProducts, setProducts] = useLocalStorage("sepela-products", []);
  const products = useMemo(() => normalizeProducts(rawProducts), [rawProducts]);

  const addProduct = useCallback((fields) => {
    const validated = validateProductFields(fields);
    if (!validated.ok) return validated;

    setProducts((prev) => {
      const id = nextProductId(prev);
      return [...normalizeProducts(prev), { id, ...validated.data }];
    });
    return { ok: true };
  }, [setProducts]);

  const updateProduct = useCallback((id, fields) => {
    const validated = validateProductFields(fields);
    if (!validated.ok) return validated;

    setProducts((prev) =>
      normalizeProducts(prev).map((p) => (p.id === id ? { ...p, ...validated.data } : p))
    );
    return { ok: true };
  }, [setProducts]);

  const deleteProduct = useCallback((id) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    return { ok: true };
  }, [setProducts]);

  const restockProduct = useCallback((id, amount, lotNumber, expirationDate) => {
    const delta = parseInt(amount, 10);
    if (Number.isNaN(delta) || delta <= 0) {
      return { ok: false, error: "Enter a positive quantity to add." };
    }

    const trimmedLot = lotNumber?.trim();
    if (trimmedLot && trimmedLot.length < 2) {
      return { ok: false, error: "Lot number must be at least 2 characters." };
    }

    if (expirationDate) {
      const [y, m, d] = expirationDate.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      if (Number.isNaN(date.getTime())) {
        return { ok: false, error: "Enter a valid expiration date." };
      }
    }

    setProducts((prev) =>
      normalizeProducts(prev).map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, stock: p.stock + delta };
        if (trimmedLot) next.lotNumber = trimmedLot;
        if (expirationDate) next.expirationDate = expirationDate;
        return next;
      })
    );
    return { ok: true };
  }, [setProducts]);

  const decrementStockForSale = useCallback((saleItems) => {
    setProducts((prev) => {
      const normalized = normalizeProducts(prev);
      return normalized.map((p) => {
        const line = saleItems.find((item) => item.productId === p.id);
        if (!line) return p;
        return { ...p, stock: Math.max(0, p.stock - line.qty) };
      });
    });
  }, [setProducts]);

  const restoreStockForRefund = useCallback((saleItems) => {
    if (!saleItems?.length) return;
    setProducts((prev) =>
      normalizeProducts(prev).map((p) => {
        const line = saleItems.find((item) => item.productId === p.id);
        if (!line) return p;
        return { ...p, stock: p.stock + line.qty };
      })
    );
  }, [setProducts]);

  return {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    restockProduct,
    decrementStockForSale,
    restoreStockForRefund,
  };
}
