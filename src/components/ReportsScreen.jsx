import { useEffect, useMemo, useState } from "react";

import { openUrl } from "@tauri-apps/plugin-opener";

import { BarChart3, CalendarRange } from "lucide-react";

import { ROLES } from "../auth/roles";

import { isTauriRuntime } from "../db/client";

import {

  fetchMerchantBranchesOnCloud,

  fetchSalesReportOnCloud,

  getStoredOperatorSession,

  hasOperatorSession,

} from "../db/authCloud";

import { aggregateSales } from "../utils/reportPeriods";
import {
  filterSalesByDateRange,
  formatDateRangeLabel,
  resolveReportPeriodPreset,
} from "../utils/reportPeriods";

import {
  buildReportCharts,
  formatCompactAmount,
} from "../utils/reportAnalytics";

import { useLocale } from "../contexts/LocaleContext";

import { paymentMethodLabel } from "../i18n";

import {

  buildDailySummaryData,

  formatDailyWhatsAppSummary,

} from "../utils/dailySummary";

import {

  buildMonthlyClosingSummaries,

  getClosingRowsForDate,

  summarizeStockRows,

} from "../utils/stockReports";

import { toSnapshotDateKey, toSnapshotMonthKey } from "../db/stockSnapshots";

import { useCurrency } from "../contexts/CurrencyContext";

import { saleExchangeRate } from "../utils/currency";

import {

  saleAppliedPromotionName,

  saleHasPromotionDiscount,

  salePromotionDiscountUsd,

} from "../utils/saleTotals";

import {

  HorizontalBarList,

  HourlyBarChart,

  MonthlyBarChart,

  ReportKpiTile,

  ReportWidget,

  TotalSalesHero,

} from "./reporting/ReportCharts";

import ReportPeriodPicker, { reportRangeQueryParams } from "./reporting/ReportPeriodPicker";



const Box = "d" + "iv";

const REPORT_TABS = [
  { id: "overview", labelKey: "reports.tabOverview" },
  { id: "period", labelKey: "reports.tabPeriod" },
  { id: "stock", labelKey: "reports.tabStock" },
  { id: "activity", labelKey: "reports.tabActivity" },
];



export default function ReportsScreen({

  sales,

  products,

  promotions = [],

  stockSnapshots = [],

  exchangeRate,

  expiryAlertDays,

  user,

  merchantCode = "local",

  portalApiBaseUrl = "",

  portalApiToken = "",

  cloudConfigured = false,

  authMode = "local",

}) {

  const currency = useCurrency();

  const { t, tError, locale } = useLocale();

  const [reportRange, setReportRange] = useState(() => resolveReportPeriodPreset("today"));

  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);

  const [activeTab, setActiveTab] = useState("overview");

  const [selectedBranchCode, setSelectedBranchCode] = useState("");

  const [branches, setBranches] = useState([]);

  const [cloudReport, setCloudReport] = useState(null);

  const [reportLoading, setReportLoading] = useState(false);

  const [reportError, setReportError] = useState("");

  const [selectedClosingDate, setSelectedClosingDate] = useState(() => toSnapshotDateKey(new Date()));

  const [selectedClosingMonth, setSelectedClosingMonth] = useState(() => toSnapshotMonthKey(new Date()));



  const useCloudReports =

    user?.role === ROLES.BOSS && cloudConfigured && !!portalApiBaseUrl && !!portalApiToken;



  const operatorSessionToken = getStoredOperatorSession();

  const cloudSessionReady = authMode === "online" && hasOperatorSession();

  const reportMerchantCode = user?.merchantCode?.trim() || merchantCode;

  const currentYear = new Date().getFullYear();



  useEffect(() => {

    if (!useCloudReports || !reportMerchantCode || reportMerchantCode === "local") {

      setBranches([]);

      return;

    }

    if (!cloudSessionReady) {

      setBranches([]);

      return;

    }

    let cancelled = false;

    (async () => {

      try {

        const result = await fetchMerchantBranchesOnCloud(

          portalApiBaseUrl,

          { merchantCode: reportMerchantCode },

          { apiToken: portalApiToken, sessionToken: operatorSessionToken }

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

  }, [

    useCloudReports,

    cloudSessionReady,

    reportMerchantCode,

    portalApiBaseUrl,

    portalApiToken,

    operatorSessionToken,

  ]);



  useEffect(() => {

    if (!useCloudReports || !reportMerchantCode || reportMerchantCode === "local") {

      setCloudReport(null);

      setReportError("");

      return;

    }

    if (!cloudSessionReady) {

      setCloudReport(null);

      setReportLoading(false);

      setReportError(t("reports.onlineSessionRequired"));

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

            merchantCode: reportMerchantCode,

            branchCode: selectedBranchCode || undefined,

            ...reportRangeQueryParams(reportRange),

          },

          { apiToken: portalApiToken, sessionToken: operatorSessionToken }

        );

        if (!cancelled) {

          setCloudReport(result);

        }

      } catch (error) {

        if (!cancelled) {

          setCloudReport(null);

          const message = String(error?.message ?? "");

          if (error?.status === 401 && /bearer token/i.test(message)) {

            setReportError(t("reports.invalidApiToken"));

          } else if (error?.status === 401) {

            setReportError(t("reports.onlineSessionRequired"));

          } else {

            setReportError(message || t("reports.loadError"));

          }

        }

      } finally {

        if (!cancelled) setReportLoading(false);

      }

    })();

    return () => {

      cancelled = true;

    };

  }, [

    useCloudReports,

    cloudSessionReady,

    authMode,

    reportMerchantCode,

    portalApiBaseUrl,

    portalApiToken,

    operatorSessionToken,

    selectedBranchCode,

    reportRange,

    t,

  ]);



  const tenantMismatch =

    !!user?.merchantCode &&

    !!merchantCode &&

    user.merchantCode !== merchantCode &&

    merchantCode !== "local";



  const filtered = useMemo(
    () => filterSalesByDateRange(sales, reportRange.from, reportRange.to),
    [sales, reportRange]
  );

  const localStats = useMemo(() => aggregateSales(filtered), [filtered]);

  const emptyStats = {

    count: 0,

    totalUSD: 0,

    totalCDF: 0,

    totalPromotionDiscountUSD: 0,

    byMethod: {},

    topProducts: [],

  };

  const preferLocalFallback =

    useCloudReports && !tenantMismatch && (!!reportError || !cloudSessionReady);

  const stats =

    cloudReport?.stats ??

    (useCloudReports && !preferLocalFallback ? emptyStats : localStats);

  const recentSales =

    cloudReport?.recentSales ??

    (useCloudReports && !preferLocalFallback ? [] : filtered.slice(0, 50));

  const branchBreakdown = cloudReport?.byBranch ?? [];

  const cloudLoadedEmpty =

    useCloudReports &&

    cloudSessionReady &&

    !reportLoading &&

    !reportError &&

    cloudReport &&

    (cloudReport.stats?.count ?? 0) === 0;



  const charts = useMemo(() => {

    const local = buildReportCharts({

      sales,

      dateRange: reportRange,

      year: currentYear,

      locale,

      stats,

      branchBreakdown,

    });



    if (cloudReport?.charts && useCloudReports && !preferLocalFallback) {

      return {

        ...local,

        monthlySeries: cloudReport.charts.monthlySeries ?? local.monthlySeries,

        hourlySeries: cloudReport.charts.hourlySeries ?? local.hourlySeries,

        topProducts: cloudReport.charts.topProducts ?? local.topProducts,

        topMonth: cloudReport.charts.topMonth ?? local.topMonth,

      };

    }

    return local;

  }, [

    sales,

    reportRange,

    currentYear,

    locale,

    stats,

    branchBreakdown,

    cloudReport,

    useCloudReports,

    preferLocalFallback,

  ]);



  const yearTotalUSD = useMemo(

    () => charts.monthlySeries.reduce((sum, row) => sum + (row.totalUSD ?? 0), 0),

    [charts.monthlySeries]

  );



  const paymentRows = useMemo(

    () =>

      charts.paymentMethods.map((row) => ({

        name: paymentMethodLabel(row.name, locale),

        totalUSD: row.totalUSD,

      })),

    [charts.paymentMethods, locale]

  );



  const topProductRows = useMemo(

    () =>

      charts.topProducts.map((row) => ({

        name: row.name,

        qty: row.qty,

      })),

    [charts.topProducts]

  );



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



  const formatChartValue = (value) => formatCompactAmount(value, locale);

  const formatMoney = (value) => currency.formatPrimary(value);

  const hasPeriodSales = stats.count > 0;



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

    <Box className="sepela-page sepela-page--reports space-y-3">

      <Box className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">

        <Box>

          <h2 className="text-xl font-bold flex items-center gap-2">

            <BarChart3 className="text-sepela-accent" />

            {t("reports.title")}

          </h2>

          <p className="sepela-hint mt-1">

            {t("reports.dashboardHint")}{" "}

            {useCloudReports

              ? t("reports.subtitleCloud", {
                  period: formatDateRangeLabel(reportRange.from, reportRange.to, locale),
                  rate: currency.rateLabel(),
                })

              : t("reports.subtitleDevice", {
                  period: formatDateRangeLabel(reportRange.from, reportRange.to, locale),
                  rate: currency.rateLabel(),
                })}

          </p>

        </Box>

        <Box className="flex flex-col sm:items-end gap-2">

          {useCloudReports && branches.length > 0 ? (

            <label className="sepela-field">

              <span className="sepela-label">{t("reports.branch")}</span>

              <select

                value={selectedBranchCode}

                onChange={(e) => setSelectedBranchCode(e.target.value)}

                className="sepela-input mt-1 block min-w-48 text-sm"

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

        </Box>

      </Box>



      {reportError ? (

        <p className="sepela-alert sepela-alert--warn">

          {tError(reportError)}

          {preferLocalFallback ? t("reports.showingDeviceOnly") : null}

        </p>

      ) : null}

      {cloudLoadedEmpty ? (

        <p className="sepela-alert sepela-alert--info">

          {t("reports.cloudEmpty")}

          {localStats.count > 0 ? ` ${t("reports.cloudEmptyLocalHint")}` : ""}

        </p>

      ) : null}

      {reportLoading && useCloudReports ? (

        <p className="sepela-hint">{t("reports.loadingCloud")}</p>

      ) : null}



      <Box className="sepela-report-tabs">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`sepela-tab ${activeTab === tab.id ? "sepela-tab--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </Box>

      <Box className="sepela-report-tab-panel">
        {activeTab === "overview" ? (
          <Box className="space-y-3">
            <Box className="sepela-report-kpi-row">
              <ReportKpiTile label={t("reports.transactions")} value={String(stats.count)} />
              <ReportKpiTile
                label={t("reports.revenue", { currency: currency.primaryCurrency })}
                value={formatMoney(stats.totalUSD)}
                accent="text-green-400"
              />
              <ReportKpiTile
                label={t("reports.revenueSecondary", { currency: currency.secondaryCurrency })}
                value={currency.formatSecondary(stats.totalUSD)}
                accent="text-sepela-accent"
              />
              <ReportKpiTile
                label={t("reports.promotionDiscounts", { currency: currency.primaryCurrency })}
                value={formatMoney(stats.totalPromotionDiscountUSD ?? 0)}
              />
            </Box>
            <Box className="sepela-report-dashboard__hero">
              <ReportWidget
                title={t("reports.monthlySalesTitle", { year: currentYear })}
                subtitle={t("reports.monthlySalesHint")}
              >
                <MonthlyBarChart
                  series={charts.monthlySeries}
                  formatValue={formatChartValue}
                  emptyLabel={t("reports.noChartData")}
                />
              </ReportWidget>
              <ReportKpiTile
                label={t("reports.totalSalesTitle")}
                value={formatCompactAmount(yearTotalUSD, locale)}
                hint={
                  charts.topMonth && charts.topMonth.totalUSD > 0
                    ? t("reports.topPerformingMonth", {
                        month: charts.topMonth.label,
                        amount: formatMoney(charts.topMonth.totalUSD),
                      })
                    : t("reports.yearSalesTotal", { year: currentYear })
                }
                accent="text-sepela-accent"
              />
            </Box>
          </Box>
        ) : null}

        {activeTab === "period" ? (
          <Box className="sepela-report-dashboard">
            <button
              type="button"
              className="sepela-report-period-banner w-full text-left"
              onClick={() => setPeriodPickerOpen(true)}
            >
              <CalendarRange size={16} className="text-sepela-accent shrink-0" />
              <span>
                {t("reports.periodicReports")} ({charts.periodRangeLabel})
              </span>
              <span className="sepela-report-period-banner__hint">{t("reports.periodChange")}</span>
            </button>



        <Box className="sepela-report-dashboard__periodic">

          <ReportWidget title={t("reports.topProducts")}>

            <HorizontalBarList

              rows={topProductRows}

              valueKey="qty"

              labelKey="name"

              formatValue={(qty) => t("reports.soldQty", { count: qty })}

              emptyLabel={t("reports.noChartData")}

            />

          </ReportWidget>



          <ReportWidget

            title={t("reports.hourlySalesTitle")}

            subtitle={t("reports.hourlySalesHint")}

          >

            <HourlyBarChart

              series={charts.hourlySeries}

              formatValue={formatChartValue}

              emptyLabel={t("reports.noChartData")}

            />

          </ReportWidget>



          <ReportWidget title={t("reports.totalSalesAmount")}>

            <TotalSalesHero

              amount={stats.totalUSD}

              formatValue={formatMoney}

              emptyLabel={t("reports.noChartData")}

              hasData={hasPeriodSales}

            />

          </ReportWidget>

        </Box>



        <Box className="sepela-report-dashboard__secondary">

          <ReportWidget title={t("reports.byPaymentMethod")}>

            <HorizontalBarList

              rows={paymentRows}

              formatValue={formatMoney}

              emptyLabel={t("reports.noChartData")}

            />

          </ReportWidget>



          {useCloudReports && !selectedBranchCode && charts.branches.length > 0 ? (
            <ReportWidget
              title={t("reports.salesByBranch", {
                period: formatDateRangeLabel(reportRange.from, reportRange.to, locale),
              })}
            >
              <HorizontalBarList
                rows={charts.branches}
                labelKey="name"
                formatValue={formatMoney}
                emptyLabel={t("reports.noChartData")}
              />
            </ReportWidget>
          ) : null}
        </Box>
          </Box>
        ) : null}

        {activeTab === "stock" ? (
          <Box className="sepela-report-panel space-y-4">
            <Box>
              <h3 className="sepela-report-section-title">{t("reports.closingStockTitle")}</h3>
              <p className="sepela-hint mt-1">{t("reports.closingStockHint")}</p>
            </Box>
            <Box className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ClosingStockPanel
                title={t("reports.closingByDate")}
                dateInput={
                  <input
                    type="date"
                    value={selectedClosingDate}
                    onChange={(e) => setSelectedClosingDate(e.target.value)}
                    className="sepela-input text-sm"
                  />
                }
                emptyMessage={t("reports.noSnapshotDate", { date: formatSnapshotDate(selectedClosingDate) })}
                rows={selectedClosingRows}
                formatMoney={formatMoney}
                t={t}
              />
              <ClosingStockPanel
                title={t("reports.monthlyHistory")}
                dateInput={
                  <input
                    type="month"
                    value={selectedClosingMonth}
                    onChange={(e) => setSelectedClosingMonth(e.target.value)}
                    className="sepela-input text-sm"
                  />
                }
                emptyMessage={t("reports.noSnapshotMonth", { month: formatSnapshotMonth(selectedClosingMonth) })}
                monthlyRows={monthlyClosingSummaries}
                formatMoney={formatMoney}
                t={t}
              />
            </Box>
          </Box>
        ) : null}

        {activeTab === "activity" ? (
          <Box className="space-y-3">
            <Box className="sepela-report-panel">
              <Box className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <Box className="space-y-1">
                  <h3 className="sepela-report-section-title">{t("reports.whatsappTitle")}</h3>
                  <p className="sepela-hint">{t("reports.whatsappHint")}</p>
                </Box>
                <Box className="flex gap-2">
                  <button type="button" onClick={handleCopyDailySummary} className="sepela-btn-secondary !w-auto">
                    {t("reports.copySummary")}
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenWhatsApp}
                    className="sepela-btn-secondary !w-auto text-green-400"
                  >
                    {t("reports.openWhatsApp")}
                  </button>
                </Box>
              </Box>
              <Box className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4 mb-4">
                <MiniStat label={t("reports.todaySales")} value={formatMoney(dailySummary.stats.totalUSD)} />
                <MiniStat label={t("reports.transactions")} value={dailySummary.stats.count.toString()} />
                <MiniStat label={t("reports.lowStock")} value={dailySummary.lowStockCount.toString()} />
                <MiniStat
                  label={t("reports.closingStock")}
                  value={`${dailySummary.closingStock.totalUnits} ${t("common.units")}`}
                />
              </Box>
              <pre className="sepela-report-code">{whatsappMessage}</pre>
            </Box>

            <Box className="sepela-report-panel overflow-hidden">
              <h3 className="sepela-label p-4" style={{ boxShadow: "inset 0 -1px 0 #383838" }}>
                {t("reports.recentTransactions")}
                {useCloudReports && selectedBranchCode
                  ? ` · ${selectedBranchCode}`
                  : useCloudReports
                    ? t("reports.recentAllBranches")
                    : ""}
              </h3>
              {recentSales.length === 0 ? (
                <p className="p-6 sepela-hint text-center">{t("reports.noSalesRecorded")}</p>
              ) : (
                <Box className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                  <table className="sepela-table w-full text-sm">
                    <thead className="sticky top-0">
                      <tr>
                        <th className="p-3">{t("invoices.columnInvoice")}</th>
                        <th className="p-3">{t("common.time")}</th>
                        {useCloudReports ? <th className="p-3">{t("reports.branch")}</th> : null}
                        <th className="p-3">{t("invoices.columnCashier")}</th>
                        <th className="p-3">{t("common.method")}</th>
                        <th className="p-3">{t("reports.columnPromotion")}</th>
                        <th className="p-3 text-right">{currency.primaryCurrency}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSales.map((sale) => {
                        const promoDiscount = salePromotionDiscountUsd(sale);
                        const promoName = saleAppliedPromotionName(sale, promotions);
                        return (
                          <tr key={`${sale.branchCode ?? "local"}-${sale.id}`}>
                            <td className="p-3 font-mono text-xs text-cyan-500 whitespace-nowrap">
                              {sale.invoiceNumber ?? "—"}
                              {sale.status === "refunded" && (
                                <span className="block sepela-hint text-red-400 font-bold">{t("common.refunded")}</span>
                              )}
                            </td>
                            <td className="p-3 sepela-text-secondary whitespace-nowrap">
                              {new Date(sale.timestamp).toLocaleString()}
                            </td>
                            {useCloudReports ? (
                              <td className="p-3 font-mono text-xs sepela-text-secondary">{sale.branchCode ?? "—"}</td>
                            ) : null}
                            <td className="p-3">{sale.cashierName}</td>
                            <td className="p-3">{sale.methodLabel ?? paymentMethodLabel(sale.method, locale)}</td>
                            <td className="p-3 text-xs">
                              {saleHasPromotionDiscount(sale) ? (
                                <Box>
                                  <span className="block text-emerald-400 font-bold">
                                    -{formatMoney(promoDiscount, saleExchangeRate(sale))}
                                  </span>
                                  {promoName ? (
                                    <span className="block sepela-hint truncate max-w-[120px]">{promoName}</span>
                                  ) : null}
                                </Box>
                              ) : (
                                <span className="sepela-hint">—</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-bold">
                              {formatMoney(sale.totalUSD, saleExchangeRate(sale))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Box>
              )}
            </Box>
          </Box>
        ) : null}
      </Box>

      <ReportPeriodPicker
        isOpen={periodPickerOpen}
        value={reportRange}
        locale={locale}
        t={t}
        onClose={() => setPeriodPickerOpen(false)}
        onApply={(range) => setReportRange(range)}
      />

    </Box>

  );

}



function MiniStat({ label, value }) {

  return (

    <Box className="sepela-panel">

      <p className="sepela-label">{label}</p>

      <p className="text-lg font-bold text-white mt-1">{value}</p>

    </Box>

  );

}



function ClosingStockPanel({ title, dateInput, emptyMessage, rows, monthlyRows, formatMoney, t }) {

  const hasRows = (rows?.length ?? 0) > 0 || (monthlyRows?.length ?? 0) > 0;

  return (

    <Box className="sepela-report-panel sepela-report-panel--deep overflow-hidden">

      <Box

        className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"

        style={{ boxShadow: "inset 0 -1px 0 #383838" }}

      >

        <h4 className="sepela-label mb-0">{title}</h4>

        {dateInput}

      </Box>

      {!hasRows ? (

        <p className="p-4 sepela-hint">{emptyMessage}</p>

      ) : monthlyRows ? (

        <Box className="max-h-72 overflow-y-auto">

          <table className="sepela-table w-full text-sm">

            <thead className="sticky top-0">

              <tr>

                <th className="p-3">{t("common.date")}</th>

                <th className="p-3 text-right">{t("reports.products")}</th>

                <th className="p-3 text-right">{t("common.units")}</th>

                <th className="p-3 text-right">{t("common.value")}</th>

              </tr>

            </thead>

            <tbody>

              {monthlyRows.map((row) => (

                <tr key={row.snapshotDate}>

                  <td className="p-3 whitespace-nowrap">{formatSnapshotDate(row.snapshotDate)}</td>

                  <td className="p-3 text-right font-mono sepela-text-muted">{row.productCount}</td>

                  <td className="p-3 text-right font-mono text-cyan-400">{row.totalUnits}</td>

                  <td className="p-3 text-right font-mono text-white">

                    {formatMoney(row.totalValueUSD)}

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </Box>

      ) : (

        <Box className="max-h-72 overflow-y-auto">

          <table className="sepela-table w-full text-sm">

            <thead className="sticky top-0">

              <tr>

                <th className="p-3">{t("common.product")}</th>

                <th className="p-3 text-right">{t("common.stock")}</th>

                <th className="p-3 text-right">{t("common.value")}</th>

              </tr>

            </thead>

            <tbody>

              {rows.map((row) => (

                <tr key={row.productId}>

                  <td className="p-3">

                    <span>{row.productName}</span>

                    {row.lotNumber && (

                      <span className="block sepela-hint font-mono">{row.lotNumber}</span>

                    )}

                  </td>

                  <td className="p-3 text-right font-mono text-cyan-400">{row.stock}</td>

                  <td className="p-3 text-right font-mono text-white">{formatMoney(row.stockValue)}</td>

                </tr>

              ))}

            </tbody>

          </table>

        </Box>

      )}

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


