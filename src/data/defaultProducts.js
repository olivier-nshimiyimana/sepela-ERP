import { parseExpiryDate } from "../utils/productExpiry";

function defaultExpiry(yearsAhead = 1) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + yearsAhead);
  return d.toISOString().slice(0, 10);
}

function withDefaults(product) {
  return {
    ...product,
    stock: typeof product.stock === "number" ? product.stock : 0,
    lotNumber: product.lotNumber?.trim() || "",
    expirationDate: product.expirationDate || defaultExpiry(),
  };
}

export function normalizeProducts(products) {
  return products.map(withDefaults);
}

export function validateProductFields({ name, lotNumber, expirationDate, price, stock }) {
  const trimmedName = name?.trim();
  const trimmedLot = lotNumber?.trim();

  if (!trimmedName) {
    return { ok: false, error: "Product name is required." };
  }
  if (!trimmedLot || trimmedLot.length < 2) {
    return { ok: false, error: "Lot number is required (min 2 characters)." };
  }
  if (!parseExpiryDate(expirationDate)) {
    return { ok: false, error: "Enter a valid expiration date." };
  }

  const parsedPrice = parseFloat(price);
  const parsedStock = parseInt(stock, 10);
  if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
    return { ok: false, error: "Enter a valid price." };
  }
  if (Number.isNaN(parsedStock) || parsedStock < 0) {
    return { ok: false, error: "Enter a valid stock quantity." };
  }

  return {
    ok: true,
    data: {
      name: trimmedName,
      lotNumber: trimmedLot,
      expirationDate,
      price: parsedPrice,
      stock: parsedStock,
    },
  };
}
