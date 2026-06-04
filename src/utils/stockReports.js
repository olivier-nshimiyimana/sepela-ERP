import { toSnapshotDateKey, toSnapshotMonthKey } from "../db/stockSnapshots";

export function summarizeStockRows(rows = []) {
  return rows.reduce(
    (acc, row) => {
      acc.productCount += 1;
      acc.totalUnits += row.stock ?? 0;
      acc.totalValueUSD += row.stockValue ?? (row.stock ?? 0) * (row.price ?? 0);
      return acc;
    },
    { productCount: 0, totalUnits: 0, totalValueUSD: 0 }
  );
}

export function getClosingRowsForDate(stockSnapshots = [], date = new Date()) {
  const key = typeof date === "string" ? date : toSnapshotDateKey(date);
  return stockSnapshots
    .filter((row) => row.snapshotDate === key)
    .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0) || a.productName.localeCompare(b.productName));
}

export function getTodayClosingRows(stockSnapshots = [], today = new Date()) {
  return getClosingRowsForDate(stockSnapshots, today);
}

export function buildMonthlyClosingSummaries(stockSnapshots = [], month = new Date()) {
  const monthKey = typeof month === "string" ? month : toSnapshotMonthKey(month);
  const grouped = new Map();

  for (const row of stockSnapshots) {
    if (row.snapshotMonth !== monthKey) continue;
    const list = grouped.get(row.snapshotDate) ?? [];
    list.push(row);
    grouped.set(row.snapshotDate, list);
  }

  return [...grouped.entries()]
    .map(([snapshotDate, rows]) => ({
      snapshotDate,
      ...summarizeStockRows(rows),
    }))
    .sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate));
}
