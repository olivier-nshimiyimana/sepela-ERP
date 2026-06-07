import {
  DEFAULT_PRIMARY_CURRENCY,
  exchangeRateLabel,
  formatMoneyPairLine,
  formatMoneyPrimary,
  normalizePrimaryCurrency,
} from "./currency";
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

export function formatDailyWhatsAppSummary(data, primaryCurrency = DEFAULT_PRIMARY_CURRENCY) {
  const primary = normalizePrimaryCurrency(primaryCurrency);
  const rate = data.exchangeRate ?? 2850;
  const lines = [
    "SEPELA DAILY REPORT",
    `Date: ${data.dateLabel}`,
    `Transactions: ${data.stats.count}`,
    `Sales: ${formatMoneyPairLine(data.stats.totalUSD, rate, primary)}`,
  ];

  const byMethod = Object.entries(data.stats.byMethod);
  if (byMethod.length > 0) {
    lines.push("Payment methods:");
    for (const [method, usd] of byMethod) {
      lines.push(`- ${method}: ${formatMoneyPrimary(usd, rate, primary)}`);
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
    `Closing stock: ${data.closingStock.productCount} products / ${data.closingStock.totalUnits} units / ${formatMoneyPrimary(data.closingStock.totalValueUSD, rate, primary)}`
  );
  lines.push(`Rate: ${exchangeRateLabel(rate, primary)}`);

  return lines.join("\n");
}
