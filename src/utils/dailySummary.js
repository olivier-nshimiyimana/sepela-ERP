import { aggregateSales, filterSalesByPeriod } from "./reportPeriods";
import { getExpiryAlerts, getExpiryStatus } from "./productExpiry";

function formatDay(date = new Date()) {
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function countLowStockProducts(products = [], expiryAlertDays = 30) {
  return products.filter((product) => {
    if ((product.stock ?? 0) <= 0 || (product.stock ?? 0) > 5) return false;
    return getExpiryStatus(product.expirationDate, expiryAlertDays) !== "expired";
  }).length;
}

function summarizeCurrentStock(products = []) {
  return products.reduce(
    (acc, product) => {
      const stock = product.stock ?? 0;
      const price = product.price ?? 0;
      acc.productCount += 1;
      acc.totalUnits += stock;
      acc.totalValueUSD += stock * price;
      return acc;
    },
    { productCount: 0, totalUnits: 0, totalValueUSD: 0 }
  );
}

export function buildDailySummaryData({
  sales = [],
  products = [],
  exchangeRate = 0,
  expiryAlertDays = 30,
} = {}) {
  const dailySales = filterSalesByPeriod(sales, "daily");
  const stats = aggregateSales(dailySales);
  const expiry = getExpiryAlerts(products, expiryAlertDays);
  const lowStockCount = countLowStockProducts(products, expiryAlertDays);
  const closingStock = summarizeCurrentStock(products);

  return {
    dateLabel: formatDay(),
    exchangeRate,
    stats,
    closingStock,
    lowStockCount,
    expiringSoonCount: expiry.expiringSoon.length,
    expiredCount: expiry.expired.length,
  };
}

export function formatDailyWhatsAppSummary(data) {
  const lines = [
    "SEPELA DAILY REPORT",
    `Date: ${data.dateLabel}`,
    `Transactions: ${data.stats.count}`,
    `Sales: $${data.stats.totalUSD.toFixed(2)} / ${Math.round(data.stats.totalCDF).toLocaleString()} FC`,
  ];

  const byMethod = Object.entries(data.stats.byMethod);
  if (byMethod.length > 0) {
    lines.push("Payment methods:");
    for (const [method, usd] of byMethod) {
      lines.push(`- ${method}: $${usd.toFixed(2)}`);
    }
  }

  if (data.stats.topProducts.length > 0) {
    lines.push("Top products:");
    for (const product of data.stats.topProducts) {
      lines.push(`- ${product.name}: ${product.qty} sold`);
    }
  }

  lines.push("Stock alerts:");
  lines.push(`- Low stock: ${data.lowStockCount}`);
  lines.push(`- Expiring soon: ${data.expiringSoonCount}`);
  lines.push(`- Expired: ${data.expiredCount}`);
  lines.push(
    `Closing stock: ${data.closingStock.productCount} products / ${data.closingStock.totalUnits} units / $${data.closingStock.totalValueUSD.toFixed(2)}`
  );
  lines.push(`Rate: 1 USD = ${Math.round(data.exchangeRate).toLocaleString()} CDF`);

  return lines.join("\n");
}
