import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BarChart3 } from "lucide-react";
import { ROLES } from "../auth/roles";
import { isTauriRuntime } from "../db/client";
import {
  fetchMerchantBranchesOnCloud,
  fetchSalesReportOnCloud,
  getStoredOperatorSession,
} from "../db/authCloud";
import { aggregateSales, filterSalesByPeriod } from "../utils/reportPeriods";
import { useLocale } from "../contexts/LocaleContext";
import { paymentMethodLabel, periodLabel } from "../i18n";
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
import { useCurrency } from "../contexts/CurrencyContext";
import { saleExchangeRate } from "../utils/currency";

const Box = "d" + "iv";
const PERIODS = ["daily", "weekly", "monthly"];

export default function ReportsScreen({
  sales,
  products,
  stockSnapshots = [],
  exchangeRate,
  expiryAlertDays,
  user,
  merchantCode = "local",
  portalApiBaseUrl = "",
  portalApiToken = "",
  cloudConfigured = false,
}) {
  const currency = useCurrency();
  const { t, tError, locale } = useLocale();
  const [period, setPeriod] = useState("daily");
  const [selectedBranchCode, setSelectedBranchCode] = useState("");
  const [branches, setBranches] = useState([]);
  const [cloudReport, setCloudReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [selectedClosingDate, setSelectedClosingDate] = useState(() => toSnapshotDateKey(new Date()));
  const [selectedClosingMonth, setSelectedClosingMonth] = useState(() => toSnapshotMonthKey(new Date()));

  const useCloudReports =
    user?.role === ROLES.BOSS && cloudConfigured && !!portalApiBaseUrl && !!portalApiToken;

  useEffect(() => {
    if (!useCloudReports || !merchantCode || merchantCode === "local") {
      setBranches([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchMerchantBranchesOnCloud(
          portalApiBaseUrl,
          { merchantCode },
          { apiToken: portalApiToken, sessionToken: getStoredOperatorSession() }
        );
        if (!cancelled) {
          setBranches((result.branches ?? []).filter((branch) => branch.status === "ACTIVE"));
        }
      } catch {
        if (!cancelled) setBranches([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useCloudReports, merchantCode, portalApiBaseUrl, portalApiToken]);

  useEffect(() => {
    if (!useCloudReports || !merchantCode || merchantCode === "local") {
      setCloudReport(null);
      setReportError("");
      return;
    }
    let cancelled = false;
    setReportLoading(true);
    setReportError("");
    (async () => {
      try {
        const result = await fetchSalesReportOnCloud(
          portalApiBaseUrl,
          {
            merchantCode,
            branchCode: selectedBranchCode || undefined,
            period,
          },
          { apiToken: portalApiToken, sessionToken: getStoredOperatorSession() }
        );
        if (!cancelled) {
          setCloudReport(result);
        }
      } catch (error) {
        if (!cancelled) {
          setCloudReport(null);
          setReportError(error?.message ?? t("reports.loadError"));
        }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useCloudReports, merchantCode, portalApiBaseUrl, portalApiToken, selectedBranchCode, period]);

  const filtered = useMemo(
    () => filterSalesByPeriod(sales, period),
    [sales, period]
  );
  const localStats = useMemo(() => aggregateSales(filtered), [filtered]);
  const stats = cloudReport?.stats ?? localStats;
  const recentSales = cloudReport?.recentSales ?? filtered.slice(0, 50);
  const branchBreakdown = cloudReport?.byBranch ?? [];
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
    () => formatDailyWhatsAppSummary(dailySummary, currency.primaryCurrency),
    [dailySummary, currency.primaryCurrency]
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
      alert(t("reports.copied"));
    } catch {
      alert(t("reports.copyFailed"));
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
      alert(t("reports.openWhatsAppFailed"));
    }
  };

  return (
    <Box className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
      <Box className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Box>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="text-amber-500" />
            {t("reports.title")}
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {useCloudReports
              ? t("reports.subtitleCloud", { period: periodLabel(period, locale), rate: currency.rateLabel() })
              : t("reports.subtitleDevice", { period: periodLabel(period, locale), rate: currency.rateLabel() })}
          </p>
        </Box>
        <Box className="flex flex-col sm:items-end gap-2">
          {useCloudReports && branches.length > 0 ? (
            <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">
              {t("reports.branch")}
              <select
                value={selectedBranchCode}
                onChange={(e) => setSelectedBranchCode(e.target.value)}
                className="mt-1 block min-w-48 bg-[#161616] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
              >
                <option value="">{t("reports.allBranches")}</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.code}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
              {periodLabel(p, locale)}
            </button>
          ))}
        </Box>
        </Box>
      </Box>

      {reportError ? (
        <p className="text-sm text-amber-400 border border-amber-900/40 bg-amber-950/20 rounded-lg px-4 py-3">
          {tError(reportError)}
          {t("reports.showingDeviceOnly")}
        </p>
      ) : null}
      {reportLoading && useCloudReports ? (
        <p className="text-sm text-gray-500">{t("reports.loadingCloud")}</p>
      ) : null}

      <Box className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t("reports.transactions")} value={stats.count.toString()} />
        <StatCard
          label={t("reports.revenue", { currency: currency.primaryCurrency })}
          value={currency.formatPrimary(stats.totalUSD)}
          accent="text-green-400"
        />
        <StatCard
          label={t("reports.revenueSecondary", { currency: currency.secondaryCurrency })}
          value={currency.formatSecondary(stats.totalUSD)}
          accent="text-blue-400"
        />
      </Box>

      {useCloudReports && !selectedBranchCode && branchBreakdown.length > 0 ? (
        <Box className="bg-[#161616] border border-gray-800 rounded-xl p-4 sm:p-5">
          <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-4">
            {t("reports.salesByBranch", { period: periodLabel(period, locale) })}
          </h3>
          <ul className="space-y-2">
            {branchBreakdown.map((row) => (
              <li key={row.branchCode} className="flex justify-between text-sm gap-4">
                <span className="text-gray-300 font-mono">{row.branchCode}</span>
                <span className="text-gray-500">{t("reports.salesCount", { count: row.count })}</span>
                <span className="font-bold text-white">{currency.formatPrimary(row.totalUSD)}</span>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}

      <Box className="bg-[#161616] border border-gray-800 rounded-xl p-4 sm:p-5">
        <Box className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <Box className="space-y-1">
            <h3 className="text-xs font-bold text-green-500 uppercase tracking-widest">
              {t("reports.whatsappTitle")}
            </h3>
            <p className="text-sm text-gray-400">
              {t("reports.whatsappHint")}
            </p>
          </Box>
          <Box className="flex gap-2">
            <button
              type="button"
              onClick={handleCopyDailySummary}
              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border border-gray-700 text-gray-200 hover:border-gray-500"
            >
              {t("reports.copySummary")}
            </button>
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border border-green-700 bg-green-950/30 text-green-400 hover:border-green-500"
            >
              {t("reports.openWhatsApp")}
            </button>
          </Box>
        </Box>

        <Box className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4 mb-4">
          <MiniStat
            label={t("reports.todaySales")}
            value={currency.formatPrimary(dailySummary.stats.totalUSD)}
          />
          <MiniStat label={t("reports.transactions")} value={dailySummary.stats.count.toString()} />
          <MiniStat label={t("reports.lowStock")} value={dailySummary.lowStockCount.toString()} />
          <MiniStat
            label={t("reports.closingStock")}
            value={`${dailySummary.closingStock.totalUnits} ${t("common.units")}`}
          />
        </Box>

        <pre className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-4 text-xs text-gray-300 whitespace-pre-wrap wrap-break-word font-mono">
          {whatsappMessage}
        </pre>
      </Box>

      <Box className="bg-[#161616] border border-gray-800 rounded-xl p-4 sm:p-5 space-y-4">
        <Box>
          <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
            {t("reports.closingStockTitle")}
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            {t("reports.closingStockHint")}
          </p>
        </Box>

        <Box className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MiniStat label={t("reports.productsOnHand")} value={selectedClosingSummary.productCount.toString()} />
          <MiniStat label={t("reports.unitsOnHand")} value={selectedClosingSummary.totalUnits.toString()} />
          <MiniStat
            label={t("reports.stockValue")}
            value={currency.formatPrimary(selectedClosingSummary.totalValueUSD)}
          />
        </Box>

        <Box className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Box className="bg-[#0f0f0f] border border-gray-800 rounded-lg overflow-hidden">
            <Box className="p-4 border-b border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                {t("reports.closingByDate")}
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
                {t("reports.noSnapshotDate", { date: formatSnapshotDate(selectedClosingDate) })}
              </p>
            ) : (
              <Box className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] uppercase text-gray-500 border-b border-gray-800 sticky top-0 bg-[#0f0f0f]">
                    <tr>
                      <th className="p-3">{t("common.product")}</th>
                      <th className="p-3 text-right">{t("common.stock")}</th>
                      <th className="p-3 text-right">{t("common.value")}</th>
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
                          {currency.formatPrimary(row.stockValue)}
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
                {t("reports.monthlyHistory")}
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
                {t("reports.noSnapshotMonth", { month: formatSnapshotMonth(selectedClosingMonth) })}
              </p>
            ) : (
              <Box className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] uppercase text-gray-500 border-b border-gray-800 sticky top-0 bg-[#0f0f0f]">
                    <tr>
                      <th className="p-3">{t("common.date")}</th>
                      <th className="p-3 text-right">{t("reports.products")}</th>
                      <th className="p-3 text-right">{t("common.units")}</th>
                      <th className="p-3 text-right">{t("common.value")}</th>
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
                          {currency.formatPrimary(row.totalValueUSD)}
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
            {t("reports.byPaymentMethod")}
          </h3>
          {Object.keys(stats.byMethod).length === 0 ? (
            <p className="text-gray-600 text-sm">{t("reports.noSalesPeriod")}</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(stats.byMethod).map(([method, usd]) => (
                <li key={method} className="flex justify-between text-sm">
                  <span className="text-gray-300">{paymentMethodLabel(method, locale)}</span>
                  <span className="font-bold text-white">{currency.formatPrimary(usd)}</span>
                </li>
              ))}
            </ul>
          )}
        </Box>

        <Box className="bg-[#161616] border border-gray-800 rounded-xl p-4">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
            {t("reports.topProducts")}
          </h3>
          {stats.topProducts.length === 0 ? (
            <p className="text-gray-600 text-sm">{t("reports.noProductData")}</p>
          ) : (
            <ul className="space-y-2">
              {stats.topProducts.map((p) => (
                <li key={p.name} className="flex justify-between text-sm">
                  <span className="text-gray-300 truncate pr-2">{p.name}</span>
                  <span className="font-mono text-blue-400 shrink-0">{p.qty} {t("common.sold")}</span>
                </li>
              ))}
            </ul>
          )}
        </Box>
      </Box>

      <Box className="bg-[#161616] border border-gray-800 rounded-xl overflow-hidden">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest p-4 border-b border-gray-800">
          {t("reports.recentTransactions")}
          {useCloudReports && selectedBranchCode
            ? ` · ${selectedBranchCode}`
            : useCloudReports
              ? t("reports.recentAllBranches")
              : ""}
        </h3>
        {recentSales.length === 0 ? (
          <p className="p-6 text-gray-600 text-sm text-center">{t("reports.noSalesRecorded")}</p>
        ) : (
          <Box className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase text-gray-500 border-b border-gray-800 sticky top-0 bg-[#161616]">
                <tr>
                  <th className="p-3">{t("invoices.columnInvoice")}</th>
                  <th className="p-3">{t("common.time")}</th>
                  {useCloudReports ? <th className="p-3">{t("reports.branch")}</th> : null}
                  <th className="p-3">{t("invoices.columnCashier")}</th>
                  <th className="p-3">{t("common.method")}</th>
                  <th className="p-3 text-right">{currency.primaryCurrency}</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr key={`${sale.branchCode ?? "local"}-${sale.id}`} className="border-b border-gray-900">
                    <td className="p-3 font-mono text-xs text-cyan-500 whitespace-nowrap">
                      {sale.invoiceNumber ?? "—"}
                      {sale.status === "refunded" && (
                        <span className="block text-[9px] text-red-400 uppercase font-bold">{t("common.refunded")}</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-400 whitespace-nowrap">
                      {new Date(sale.timestamp).toLocaleString()}
                    </td>
                    {useCloudReports ? (
                      <td className="p-3 font-mono text-xs text-gray-500">{sale.branchCode ?? "—"}</td>
                    ) : null}
                    <td className="p-3">{sale.cashierName}</td>
                    <td className="p-3">{sale.methodLabel ?? paymentMethodLabel(sale.method, locale)}</td>
                    <td className="p-3 text-right font-bold">
                      {currency.formatPrimary(sale.totalUSD, saleExchangeRate(sale))}
                    </td>
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
