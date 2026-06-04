export function summarizeClientSales(sales = []) {
  const invoiceCount = sales.length;
  const refundedSales = sales.filter((sale) => sale.status === "refunded");
  const refundedCount = refundedSales.length;
  const grossUSD = sales.reduce((sum, sale) => sum + (sale.totalUSD ?? 0), 0);
  const grossCDF = sales.reduce((sum, sale) => sum + (sale.totalCDF ?? 0), 0);
  const refundedUSD = refundedSales.reduce((sum, sale) => sum + (sale.totalUSD ?? 0), 0);
  const refundedCDF = refundedSales.reduce((sum, sale) => sum + (sale.totalCDF ?? 0), 0);

  return {
    invoiceCount,
    refundedCount,
    grossUSD,
    grossCDF,
    refundedUSD,
    refundedCDF,
    netUSD: grossUSD - refundedUSD,
    netCDF: grossCDF - refundedCDF,
  };
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function filterClientSalesByDateRange(sales = [], { from = "", to = "" } = {}) {
  const hasFrom = String(from ?? "").trim().length > 0;
  const hasTo = String(to ?? "").trim().length > 0;
  if (!hasFrom && !hasTo) return sales;

  const fromDate = hasFrom ? startOfDay(from) : null;
  const toDate = hasTo ? endOfDay(to) : null;

  return sales.filter((sale) => {
    const timestamp = new Date(sale.timestamp);
    if (Number.isNaN(timestamp.getTime())) return false;
    if (fromDate && timestamp < fromDate) return false;
    if (toDate && timestamp > toDate) return false;
    return true;
  });
}

export function formatClientStatementRange({ from = "", to = "" } = {}) {
  const fromText = String(from ?? "").trim();
  const toText = String(to ?? "").trim();
  if (fromText && toText) return `${fromText} to ${toText}`;
  if (fromText) return `From ${fromText}`;
  if (toText) return `Up to ${toText}`;
  return "All time";
}

function formatStatementDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value ?? "");
  }
}

export function formatClientStatementText({ customer, sales = [], profile = {}, range = {} }) {
  const summary = summarizeClientSales(sales);
  const companyName = profile.companyName?.trim() || "Sepela ERP";
  const rangeLabel = formatClientStatementRange(range);
  const lines = [
    `${companyName} - Client Statement`,
    `Client: ${customer?.name ?? "Unknown client"}`,
    customer?.phone ? `Phone: ${customer.phone}` : null,
    customer?.taxNumber ? `Tax: ${customer.taxNumber}` : null,
    customer?.email ? `Email: ${customer.email}` : null,
    customer?.address ? `Address: ${customer.address}` : null,
    "",
    `Period: ${rangeLabel}`,
    `Invoices: ${summary.invoiceCount}`,
    `Refunded: ${summary.refundedCount}`,
    `Gross billed: $${summary.grossUSD.toFixed(2)} / ${Math.round(summary.grossCDF).toLocaleString()} FC`,
    `Net after refunds: $${summary.netUSD.toFixed(2)} / ${Math.round(summary.netCDF).toLocaleString()} FC`,
    "",
    "Recent invoices:",
  ];

  const recentSales = [...sales]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 20);

  if (recentSales.length === 0) {
    lines.push("- No invoices yet.");
  } else {
    for (const sale of recentSales) {
      lines.push(
        `- ${sale.invoiceNumber ?? sale.id} | ${formatStatementDate(sale.timestamp)} | $${(
          sale.totalUSD ?? 0
        ).toFixed(2)} | ${sale.status === "refunded" ? "REFUNDED" : "COMPLETED"}`
      );
    }
    if (sales.length > recentSales.length) {
      lines.push(`- ... ${sales.length - recentSales.length} more invoice(s)`);
    }
  }

  return lines.filter(Boolean).join("\n");
}
