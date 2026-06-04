import { useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BarChart3 } from "lucide-react";
import { isTauriRuntime } from "../db/client";
import {
  aggregateSales,
  filterSalesByPeriod,
  PERIOD_LABELS,
} from "../utils/reportPeriods";
import {
  buildDailySummaryData,
  formatDailyWhatsAppSummary,
} from "../utils/dailySummary";
import {
  buildMonthlyClosingSummaries,
  getClosingRowsForDate,
  getTodayClosingRows,
  summarizeStockRows,
} from "../utils/stockReports";
import { toSnapshotDateKey, toSnapshotMonthKey } from "../db/stockSnapshots";

const Box = "d" + "iv";
const PERIODS = ["daily", "weekly", "monthly"];

export default function ReportsScreen({
  sales,
  products,
  stockSnapshots = [],
  exchangeRate,
  expiryAlertDays,
}) {
  const [period, setPeriod] = useState("daily");
  const [selectedClosingDate, setSelectedClosingDate] = useState(() => toSnapshotDateKey(new Date()));
  const [selectedClosingMonth, setSelectedClosingMonth] = useState(() => toSnapshotMonthKey(new Date()));

  const filtered = useMemo(
    () => filterSalesByPeriod(sales, period),
    [sales, period]
  );
  const stats = useMemo(() => aggregateSales(filtered), [filtered]);
  const dailySummary = useMemo(
    () =>
      buildDailySummaryData({
        sales,
        products,
        exchangeRate,
        expiryAlertDays,
      }),
    [sales, products, exchangeRate, expiryAlertDays]
  );
  const whatsappMessage = useMemo(
    () => formatDailyWhatsAppSummary(dailySummary),
    [dailySummary]
  );
  const selectedClosingRows = useMemo(() => {
    const rows = getClosingRowsForDate(stockSnapshots, selectedClosingDate);
    if (rows.length > 0) return rows;
    if (selectedClosingDate !== toSnapshotDateKey(new Date())) return [];
    return products
      .map((product) => ({
        productId: product.id,
        productName: product.name,
        lotNumber: product.lotNumber,
        price: product.price,
        stock: product.stock,
        stockValue: (product.stock ?? 0) * (product.price ?? 0),
      }))
      .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0) || a.productName.localeCompare(b.productName));
  }, [stockSnapshots, products, selectedClosingDate]);
  const selectedClosingSummary = useMemo(
    () => summarizeStockRows(selectedClosingRows),
    [selectedClosingRows]
  );
  const monthlyClosingSummaries = useMemo(
    () => buildMonthlyClosingSummaries(stockSnapshots, selectedClosingMonth),
    [stockSnapshots, selectedClosingMonth]
  );

  const handleCopyDailySummary = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(whatsappMessage);
      } else {
        const input = document.createElement("textarea");
        input.value = whatsappMessage;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      alert("Daily summary copied for WhatsApp.");
    } catch {
      alert("Could not copy the daily summary.");
    }
  };

  const handleOpenWhatsApp = async () => {
    const url = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;
    try {
      if (isTauriRuntime()) {
        await openUrl(url);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      alert("Could not open WhatsApp.");
    }
  };

  return (
    <Box className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
      <Box className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Box>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="text-amber-500" />
            Sales reports
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {PERIOD_LABELS[period]} · rate 1 USD = {exchangeRate.toLocaleString()} CDF
          </p>
        </Box>
        <Box className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border transition-colors ${
                period === p
                  ? "border-amber-500 bg-amber-950/30 text-amber-400"
                  : "border-gray-800 text-gray-500 hover:border-gray-600"
              }`}
            >
              {p}
            </button>
          ))}
        </Box>
      </Box>

      <Box className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Transactions" value={stats.count.toString()} />
        <StatCard label="Revenue (USD)" value={`$${stats.totalUSD.toFixed(2)}`} accent="text-blue-400" />
        <StatCard
          label="Revenue (CDF)"
          value={`${stats.totalCDF.toLocaleString()} FC`}
          accent="text-green-500"
        />
      </Box>

      <Box className="bg-[#161616] border border-gray-800 rounded-xl p-4 sm:p-5">
        <Box className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <Box className="space-y-1">
            <h3 className="text-xs font-bold text-green-500 uppercase tracking-widest">
              WhatsApp daily summary
            </h3>
            <p className="text-sm text-gray-400">
              Ready for the boss to send or forward each day.
            </p>
          </Box>
          <Box className="flex gap-2">
            <button
              type="button"
              onClick={handleCopyDailySummary}
              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border border-gray-700 text-gray-200 hover:border-gray-500"
            >
              Copy summary
            </button>
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border border-green-700 bg-green-950/30 text-green-400 hover:border-green-500"
            >
              Open WhatsApp
            </button>
          </Box>
        </Box>

        <Box className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4 mb-4">
          <MiniStat label="Today sales" value={`$${dailySummary.stats.totalUSD.toFixed(2)}`} />
          <MiniStat label="Transactions" value={dailySummary.stats.count.toString()} />
          <MiniStat label="Low stock" value={dailySummary.lowStockCount.toString()} />
          <MiniStat label="Closing stock" value={`${dailySummary.closingStock.totalUnits} units`} />
        </Box>

        <pre className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-4 text-xs text-gray-300 whitespace-pre-wrap wrap-break-word font-mono">
          {whatsappMessage}
        </pre>
      </Box>

      <Box className="bg-[#161616] border border-gray-800 rounded-xl p-4 sm:p-5 space-y-4">
        <Box>
          <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
            Closing stock
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Inspect any recorded day and review month-by-month closing history.
          </p>
        </Box>

        <Box className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MiniStat label="Products on hand" value={selectedClosingSummary.productCount.toString()} />
          <MiniStat label="Units on hand" value={selectedClosingSummary.totalUnits.toString()} />
          <MiniStat
            label="Stock value"
            value={`$${selectedClosingSummary.totalValueUSD.toFixed(2)}`}
          />
        </Box>

        <Box className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Box className="bg-[#0f0f0f] border border-gray-800 rounded-lg overflow-hidden">
            <Box className="p-4 border-b border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                Closing stock by date
              </h4>
              <input
                type="date"
                value={selectedClosingDate}
                onChange={(e) => setSelectedClosingDate(e.target.value)}
                className="bg-[#161616] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-cyan-500"
              />
            </Box>
            {selectedClosingRows.length === 0 ? (
              <p className="p-4 text-sm text-gray-600">
                No stock snapshot recorded for {formatSnapshotDate(selectedClosingDate)}.
              </p>
            ) : (
              <Box className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] uppercase text-gray-500 border-b border-gray-800 sticky top-0 bg-[#0f0f0f]">
                    <tr>
                      <th className="p-3">Product</th>
                      <th className="p-3 text-right">Stock</th>
                      <th className="p-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedClosingRows.map((row) => (
                      <tr key={row.productId} className="border-b border-gray-900">
                        <td className="p-3">
                          <span className="text-gray-200">{row.productName}</span>
                          {row.lotNumber && (
                            <span className="block text-[10px] text-gray-500 font-mono">
                              {row.lotNumber}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono text-cyan-400">{row.stock}</td>
                        <td className="p-3 text-right font-mono text-white">
                          ${row.stockValue.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            )}
          </Box>

          <Box className="bg-[#0f0f0f] border border-gray-800 rounded-lg overflow-hidden">
            <Box className="p-4 border-b border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                Monthly closing history
              </h4>
              <input
                type="month"
                value={selectedClosingMonth}
                onChange={(e) => setSelectedClosingMonth(e.target.value)}
                className="bg-[#161616] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-cyan-500"
              />
            </Box>
            {monthlyClosingSummaries.length === 0 ? (
              <p className="p-4 text-sm text-gray-600">
                No stock snapshots recorded for {formatSnapshotMonth(selectedClosingMonth)}.
              </p>
            ) : (
              <Box className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] uppercase text-gray-500 border-b border-gray-800 sticky top-0 bg-[#0f0f0f]">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right">Products</th>
                      <th className="p-3 text-right">Units</th>
                      <th className="p-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyClosingSummaries.map((row) => (
                      <tr key={row.snapshotDate} className="border-b border-gray-900">
                        <td className="p-3 text-gray-300 whitespace-nowrap">
                          {formatSnapshotDate(row.snapshotDate)}
                        </td>
                        <td className="p-3 text-right font-mono text-gray-300">
                          {row.productCount}
                        </td>
                        <td className="p-3 text-right font-mono text-cyan-400">
                          {row.totalUnits}
                        </td>
                        <td className="p-3 text-right font-mono text-white">
                          ${row.totalValueUSD.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <Box className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Box className="bg-[#161616] border border-gray-800 rounded-xl p-4">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
            By payment method
          </h3>
          {Object.keys(stats.byMethod).length === 0 ? (
            <p className="text-gray-600 text-sm">No sales in this period.</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(stats.byMethod).map(([method, usd]) => (
                <li key={method} className="flex justify-between text-sm">
                  <span className="text-gray-300">{method}</span>
                  <span className="font-bold text-white">${usd.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </Box>

        <Box className="bg-[#161616] border border-gray-800 rounded-xl p-4">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
            Top products
          </h3>
          {stats.topProducts.length === 0 ? (
            <p className="text-gray-600 text-sm">No product data yet.</p>
          ) : (
            <ul className="space-y-2">
              {stats.topProducts.map((p) => (
                <li key={p.name} className="flex justify-between text-sm">
                  <span className="text-gray-300 truncate pr-2">{p.name}</span>
                  <span className="font-mono text-blue-400 shrink-0">{p.qty} sold</span>
                </li>
              ))}
            </ul>
          )}
        </Box>
      </Box>

      <Box className="bg-[#161616] border border-gray-800 rounded-xl overflow-hidden">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest p-4 border-b border-gray-800">
          Recent transactions
        </h3>
        {filtered.length === 0 ? (
          <p className="p-6 text-gray-600 text-sm text-center">No sales recorded for this period.</p>
        ) : (
          <Box className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase text-gray-500 border-b border-gray-800 sticky top-0 bg-[#161616]">
                <tr>
                  <th className="p-3">Invoice</th>
                  <th className="p-3">Time</th>
                  <th className="p-3">Cashier</th>
                  <th className="p-3">Method</th>
                  <th className="p-3 text-right">USD</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-900">
                    <td className="p-3 font-mono text-xs text-cyan-500 whitespace-nowrap">
                      {sale.invoiceNumber ?? "—"}
                      {sale.status === "refunded" && (
                        <span className="block text-[9px] text-red-400 uppercase font-bold">Refunded</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-400 whitespace-nowrap">
                      {new Date(sale.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3">{sale.cashierName}</td>
                    <td className="p-3">{sale.methodLabel}</td>
                    <td className="p-3 text-right font-bold">${sale.totalUSD.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function StatCard({ label, value, accent = "text-white" }) {
  return (
    <Box className="bg-[#161616] border border-gray-800 rounded-xl p-5">
      <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">{label}</p>
      <p className={`text-3xl font-black mt-2 ${accent}`}>{value}</p>
    </Box>
  );
}

function MiniStat({ label, value }) {
  return (
    <Box className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-3">
      <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">{label}</p>
      <p className="text-lg font-black text-white mt-1">{value}</p>
    </Box>
  );
}

function formatSnapshotDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatSnapshotMonth(value) {
  const date = new Date(`${value}-01T00:00:00`);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
}
