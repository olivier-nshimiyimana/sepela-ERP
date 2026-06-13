import { roundUsd } from "./moneyRounding";
import {
  endOfDay,
  filterSalesByDateRange,
  formatDateRangeLabel,
  resolveReportPeriodPreset,
  startOfDay,
  startOfYear,
} from "./reportPeriods";

function isCompletedSale(sale) {
  return sale?.status !== "refunded";
}

function saleTimestamp(sale) {
  const ts = new Date(sale?.timestamp ?? 0);
  return Number.isNaN(ts.getTime()) ? null : ts;
}

export function periodRange(period, now = new Date()) {
  const mapped =
    period === "weekly" ? "this_week" : period === "monthly" ? "this_month" : "today";
  const range = resolveReportPeriodPreset(mapped, now);
  return { from: range.from, to: range.to };
}

export function formatPeriodRangeLabel(period, locale = "en") {
  const { from, to } = periodRange(period);
  return formatDateRangeLabel(from, to, locale);
}

export function filterSalesFromDate(sales, fromMs, toMs = Date.now()) {
  return (sales ?? []).filter((sale) => {
    const ts = saleTimestamp(sale);
    return ts && ts.getTime() >= fromMs && ts.getTime() <= toMs;
  });
}

export function buildMonthlySalesSeries(sales, year = new Date().getFullYear(), locale = "en") {
  const buckets = Array.from({ length: 12 }, (_, month) => ({
    month,
    label: new Date(year, month, 1)
      .toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { month: "short" })
      .replace(/\./g, "")
      .toUpperCase(),
    totalUSD: 0,
    count: 0,
  }));

  for (const sale of sales ?? []) {
    if (!isCompletedSale(sale)) continue;
    const ts = saleTimestamp(sale);
    if (!ts || ts.getFullYear() !== year) continue;
    const bucket = buckets[ts.getMonth()];
    bucket.totalUSD += sale.totalUSD ?? 0;
    bucket.count += 1;
  }

  return buckets.map((bucket) => ({
    ...bucket,
    totalUSD: roundUsd(bucket.totalUSD),
  }));
}

export function buildHourlySalesSeries(sales) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    totalUSD: 0,
    count: 0,
  }));

  for (const sale of sales ?? []) {
    if (!isCompletedSale(sale)) continue;
    const ts = saleTimestamp(sale);
    if (!ts) continue;
    const bucket = buckets[ts.getHours()];
    bucket.totalUSD += sale.totalUSD ?? 0;
    bucket.count += 1;
  }

  return buckets.map((bucket) => ({
    ...bucket,
    totalUSD: roundUsd(bucket.totalUSD),
  }));
}

export function buildTopProductsChart(sales, limit = 8) {
  const byProduct = {};

  for (const sale of sales ?? []) {
    if (!isCompletedSale(sale)) continue;
    for (const item of sale.items ?? []) {
      const name = String(item.name ?? "").trim() || "—";
      if (!byProduct[name]) {
        byProduct[name] = { name, qty: 0, revenueUSD: 0 };
      }
      byProduct[name].qty += Number(item.qty ?? 0) || 0;
      byProduct[name].revenueUSD += (Number(item.qty ?? 0) || 0) * (Number(item.price ?? 0) || 0);
    }
  }

  return Object.values(byProduct)
    .map((row) => ({ ...row, revenueUSD: roundUsd(row.revenueUSD) }))
    .sort((a, b) => b.qty - a.qty || b.revenueUSD - a.revenueUSD)
    .slice(0, limit);
}

export function buildMethodChart(byMethod = {}) {
  return Object.entries(byMethod)
    .map(([name, totalUSD]) => ({ name, totalUSD: roundUsd(totalUSD) }))
    .sort((a, b) => b.totalUSD - a.totalUSD);
}

export function buildBranchChart(branchBreakdown = []) {
  return (branchBreakdown ?? [])
    .map((row) => ({
      name: row.branchCode,
      totalUSD: roundUsd(row.totalUSD ?? 0),
      count: row.count ?? 0,
    }))
    .sort((a, b) => b.totalUSD - a.totalUSD);
}

export function findTopMonth(monthlySeries = []) {
  if (!monthlySeries.length) return null;
  return monthlySeries.reduce((best, row) =>
    row.totalUSD > (best?.totalUSD ?? 0) ? row : best
  , null);
}

export function formatCompactAmount(value, locale = "en") {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(Math.round(n));
  }
}

export function buildReportCharts({
  sales = [],
  dateRange = resolveReportPeriodPreset("today"),
  year = new Date().getFullYear(),
  locale = "en",
  stats = {},
  branchBreakdown = [],
}) {
  const periodSales = filterSalesByDateRange(sales, dateRange.from, dateRange.to);
  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearSales = filterSalesByDateRange(sales, yearStart, endOfDay(new Date(year, 11, 31)));

  return {
    monthlySeries: buildMonthlySalesSeries(yearSales, year, locale),
    hourlySeries: buildHourlySalesSeries(periodSales),
    topProducts: buildTopProductsChart(periodSales, 8),
    paymentMethods: buildMethodChart(stats.byMethod ?? {}),
    branches: buildBranchChart(branchBreakdown),
    topMonth: findTopMonth(buildMonthlySalesSeries(yearSales, year, locale)),
    periodRangeLabel: formatDateRangeLabel(dateRange.from, dateRange.to, locale),
  };
}
