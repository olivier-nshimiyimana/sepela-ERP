import { expandCartToSaleItems } from "./fefo";

/** Ephemeral sale object for proforma preview (not persisted). */
export function buildProformaFromCart(cart, user, exchangeRate, totalUSD) {
  const totalCDF = totalUSD * exchangeRate;
  return {
    id: `proforma_${Date.now()}`,
    invoiceNumber: "PROFORMA",
    timestamp: new Date().toISOString(),
    status: "proforma",
    items: expandCartToSaleItems(cart),
    totalUSD,
    totalCDF,
    cashierName: user?.displayName ?? "Sepela Staff",
    methodLabel: "—",
  };
}
