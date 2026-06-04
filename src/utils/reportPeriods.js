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

export function filterSalesByPeriod(sales, period) {
  const now = new Date();
  let from;
  switch (period) {
    case "daily":
      from = startOfDay(now);
      break;
    case "weekly":
      from = startOfWeek(now);
      break;
    case "monthly":
      from = startOfMonth(now);
      break;
    default:
      from = startOfDay(now);
  }
  const fromMs = from.getTime();
  return sales.filter((s) => new Date(s.timestamp).getTime() >= fromMs);
}

export function aggregateSales(sales) {
  const byMethod = {};
  const productCounts = {};

  let totalUSD = 0;
  let totalCDF = 0;

  for (const sale of sales) {
    if (sale.status === "refunded") continue;
    totalUSD += sale.totalUSD ?? 0;
    totalCDF += sale.totalCDF ?? 0;

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

  return {
    count: sales.filter((s) => s.status !== "refunded").length,
    totalUSD,
    totalCDF,
    byMethod,
    topProducts,
  };
}

export const PERIOD_LABELS = {
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
};
