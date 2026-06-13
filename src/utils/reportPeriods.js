import { roundCdf, roundUsd } from "./moneyRounding";
import { salePromotionDiscountUsd } from "./saleTotals";

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfYear(date) {
  const d = startOfDay(date);
  d.setMonth(0, 1);
  return d;
}

export function toDateInputValue(date) {
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromDateInputValue(value) {
  return startOfDay(new Date(`${value}T00:00:00`));
}

export const REPORT_PERIOD_PRESETS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_year",
  "last_year",
];

export function resolveReportPeriodPreset(preset, anchor = new Date()) {
  const today = startOfDay(anchor);
  switch (preset) {
    case "yesterday": {
      const day = new Date(today);
      day.setDate(day.getDate() - 1);
      return { from: day, to: day, preset };
    }
    case "this_week":
      return { from: startOfWeek(anchor), to: today, preset };
    case "last_week": {
      const weekStart = startOfWeek(anchor);
      const end = new Date(weekStart);
      end.setDate(end.getDate() - 1);
      return { from: startOfWeek(end), to: end, preset };
    }
    case "this_month":
      return { from: startOfMonth(anchor), to: today, preset };
    case "last_month": {
      const start = startOfMonth(anchor);
      start.setMonth(start.getMonth() - 1);
      const end = new Date(startOfMonth(anchor));
      end.setDate(end.getDate() - 1);
      return { from: start, to: end, preset };
    }
    case "this_year":
      return { from: startOfYear(anchor), to: today, preset };
    case "last_year": {
      const year = anchor.getFullYear() - 1;
      return {
        from: startOfDay(new Date(year, 0, 1)),
        to: endOfDay(new Date(year, 11, 31)),
        preset,
      };
    }
    case "today":
    default:
      return { from: today, to: today, preset: "today" };
  }
}

export function formatDateRangeLabel(from, to, locale = "en") {
  const fmt = (date) =>
    date.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (start.getTime() === end.getTime()) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

export function filterSalesByDateRange(sales, from, to) {
  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();
  return (sales ?? []).filter((sale) => {
    const ts = new Date(sale.timestamp).getTime();
    return !Number.isNaN(ts) && ts >= fromMs && ts <= toMs;
  });
}

export function filterSalesByPeriod(sales, period) {
  const range = resolveReportPeriodPreset(
    period === "weekly" ? "this_week" : period === "monthly" ? "this_month" : "today"
  );
  return filterSalesByDateRange(sales, range.from, range.to);
}

export function aggregateSales(sales) {
  const byMethod = {};
  const productCounts = {};

  let totalUSD = 0;
  let totalCDF = 0;
  let totalPromotionDiscountUSD = 0;

  for (const sale of sales) {
    if (sale.status === "refunded") continue;
    totalUSD += sale.totalUSD ?? 0;
    totalCDF += sale.totalCDF ?? 0;
    totalPromotionDiscountUSD += salePromotionDiscountUsd(sale);

    const method = sale.methodLabel ?? sale.method ?? "Unknown";
    byMethod[method] = (byMethod[method] ?? 0) + (sale.totalUSD ?? 0);

    for (const item of sale.items ?? []) {
      const key = item.name;
      productCounts[key] = (productCounts[key] ?? 0) + item.qty;
    }
  }

  const topProducts = Object.entries(productCounts)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const roundedByMethod = {};
  for (const [method, usd] of Object.entries(byMethod)) {
    roundedByMethod[method] = roundUsd(usd);
  }

  return {
    count: sales.filter((s) => s.status !== "refunded").length,
    totalUSD: roundUsd(totalUSD),
    totalCDF: roundCdf(totalCDF),
    totalPromotionDiscountUSD: roundUsd(totalPromotionDiscountUSD),
    byMethod: roundedByMethod,
    topProducts,
  };
}

export const PERIOD_LABELS = {
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
};
