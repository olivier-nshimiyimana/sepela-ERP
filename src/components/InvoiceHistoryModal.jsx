import { useEffect, useMemo, useState } from "react";
import { Calendar, FileText, Search } from "lucide-react";
import { can, PERMISSIONS } from "../auth/permissions";
import { useCurrency } from "../contexts/CurrencyContext";
import { useLocale } from "../contexts/LocaleContext";
import { saleExchangeRate } from "../utils/currency";
import { startOfDay, startOfMonth, startOfWeek } from "../utils/reportPeriods";
import {
  saleAppliedPromotionName,
  saleHasPromotionDiscount,
  salePromotionDiscountUsd,
} from "../utils/saleTotals";
import ManagementScreen from "./ManagementScreen";

const Box = "d" + "iv";

const PRESET_IDS = ["today", "week", "month", "all"];
const PRESET_KEYS = {
  today: "common.today",
  week: "common.thisWeek",
  month: "common.thisMonth",
  all: "common.allTime",
};

function toDateInputValue(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function combineDateAndTime(dateValue, timeValue, asEnd) {
  if (!dateValue) return null;
  const d = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (!timeValue) {
    if (asEnd) return endOfDay(d);
    return startOfDay(d);
  }
  const [hours, minutes] = timeValue.split(":").map((part) => Number(part));
  d.setHours(hours ?? 0, minutes ?? 0, asEnd ? 59 : 0, asEnd ? 999 : 0);
  return d;
}

function presetRange(presetId) {
  const now = new Date();
  if (presetId === "all") {
    return { from: "", to: "", timeFrom: "", timeTo: "" };
  }
  if (presetId === "week") {
    return {
      from: toDateInputValue(startOfWeek(now)),
      to: toDateInputValue(now),
      timeFrom: "",
      timeTo: "",
    };
  }
  if (presetId === "month") {
    return {
      from: toDateInputValue(startOfMonth(now)),
      to: toDateInputValue(now),
      timeFrom: "",
      timeTo: "",
    };
  }
  const today = toDateInputValue(now);
  return { from: today, to: today, timeFrom: "", timeTo: "" };
}

export default function InvoiceHistoryModal({
  isOpen,
  onClose,
  sales,
  promotions = [],
  user,
  onViewInvoice,
  onRefund,
}) {
  const currency = useCurrency();
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState("today");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");

  const canRefund = can(user.role, PERMISSIONS.REFUND_SALE);

  useEffect(() => {
    if (!isOpen) return;
    const range = presetRange("today");
    setPreset("today");
    setQuery("");
    setDateFrom(range.from);
    setDateTo(range.to);
    setTimeFrom(range.timeFrom);
    setTimeTo(range.timeTo);
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rangeStart = combineDateAndTime(dateFrom, timeFrom, false);
    const rangeEnd = combineDateAndTime(dateTo, timeTo, true);

    let list = [...sales].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (rangeStart) {
      const startMs = rangeStart.getTime();
      list = list.filter((sale) => new Date(sale.timestamp).getTime() >= startMs);
    }
    if (rangeEnd) {
      const endMs = rangeEnd.getTime();
      list = list.filter((sale) => new Date(sale.timestamp).getTime() <= endMs);
    }

    if (q) {
      list = list.filter(
        (sale) =>
          (sale.invoiceNumber && sale.invoiceNumber.toLowerCase().includes(q)) ||
          (sale.cashierName && sale.cashierName.toLowerCase().includes(q)) ||
          sale.id.toLowerCase().includes(q)
      );
    }

    return list.slice(0, 500);
  }, [sales, query, dateFrom, dateTo, timeFrom, timeTo]);

  function applyPreset(nextPreset) {
    const range = presetRange(nextPreset);
    setPreset(nextPreset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setTimeFrom(range.timeFrom);
    setTimeTo(range.timeTo);
  }

  function handleDateChange(field, value) {
    setPreset("custom");
    if (field === "from") setDateFrom(value);
    if (field === "to") setDateTo(value);
    if (field === "timeFrom") setTimeFrom(value);
    if (field === "timeTo") setTimeTo(value);
  }

  if (!isOpen) return null;

  return (
    <ManagementScreen
      isOpen={isOpen}
      onClose={onClose}
      title={t("invoices.title")}
      icon={FileText}
      wide
    >
      <Box className="sepela-filter-bar">
        <Box className="flex flex-wrap gap-2 items-center">
          {PRESET_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => applyPreset(id)}
              className={`sepela-preset-btn ${preset === id ? "sepela-preset-btn--active" : ""}`}
            >
              {t(PRESET_KEYS[id])}
            </button>
          ))}
          <span className="ml-auto text-xs text-sepela-muted font-semibold">
            {filtered.length}{" "}
            {filtered.length === 1 ? t("common.invoice") : t("common.invoices")}
          </span>
        </Box>

        <Box className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <label className="sepela-field">
            <span className="sepela-label">{t("common.fromDate")}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateChange("from", e.target.value)}
              className="sepela-input"
            />
          </label>
          <label className="sepela-field">
            <span className="sepela-label">{t("common.fromTime")}</span>
            <input
              type="time"
              value={timeFrom}
              onChange={(e) => handleDateChange("timeFrom", e.target.value)}
              className="sepela-input"
            />
          </label>
          <label className="sepela-field">
            <span className="sepela-label">{t("common.toDate")}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateChange("to", e.target.value)}
              className="sepela-input"
            />
          </label>
          <label className="sepela-field">
            <span className="sepela-label">{t("common.toTime")}</span>
            <input
              type="time"
              value={timeTo}
              onChange={(e) => handleDateChange("timeTo", e.target.value)}
              className="sepela-input"
            />
          </label>
        </Box>

        <Box className="sepela-search-wrap">
          <Search className="sepela-search-icon" size={16} />
          <input
            type="text"
            placeholder={t("invoices.searchPlaceholder")}
            className="sepela-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Box>

        {(dateFrom || dateTo || timeFrom || timeTo) && (
          <Box className="flex items-center gap-2 text-xs text-sepela-muted font-semibold">
            <Calendar size={14} />
            <span>
              Showing
              {dateFrom ? ` from ${dateFrom}${timeFrom ? ` ${timeFrom}` : ""}` : ""}
              {dateTo ? ` to ${dateTo}${timeTo ? ` ${timeTo}` : ""}` : ""}
              {!dateFrom && !dateTo ? " all dates" : ""}
            </span>
          </Box>
        )}
      </Box>

      {filtered.length === 0 ? (
        <p className="text-center text-sepela-muted text-sm py-8 font-semibold">
          {t("invoices.noInvoices")}
        </p>
      ) : (
        <Box className="sepela-subpanel overflow-auto">
          <table className="sepela-table text-sm">
            <thead>
              <tr>
                <th>{t("invoices.columnInvoice")}</th>
                <th>{t("invoices.columnWhen")}</th>
                <th>{t("invoices.columnCashier")}</th>
                <th>{t("invoices.columnPromotion")}</th>
                <th className="text-right">{currency.primaryCurrency}</th>
                <th className="w-36" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((sale) => {
                const promoDiscount = salePromotionDiscountUsd(sale);
                const promoName = saleAppliedPromotionName(sale, promotions);
                return (
                  <tr key={sale.id} className="sepela-row-divider">
                    <td className="font-mono font-bold text-sepela-accent">
                      {sale.invoiceNumber ?? `— ${sale.id.slice(-6)}`}
                    </td>
                    <td className="text-sepela-muted whitespace-nowrap text-xs">
                      {new Date(sale.timestamp).toLocaleString()}
                    </td>
                    <td className="text-xs">{sale.cashierName}</td>
                    <td className="text-xs">
                      {saleHasPromotionDiscount(sale) ? (
                        <Box>
                          <span className="block text-emerald-400 font-bold sepela-money">
                            -{currency.formatPrimary(promoDiscount, saleExchangeRate(sale))}
                          </span>
                          {promoName ? (
                            <span className="block text-[10px] text-sepela-muted truncate max-w-[140px]">
                              {promoName}
                            </span>
                          ) : null}
                        </Box>
                      ) : (
                        <span className="text-sepela-muted">—</span>
                      )}
                    </td>
                    <td className="text-right font-bold sepela-money">
                      {currency.formatPrimary(sale.totalUSD ?? 0, saleExchangeRate(sale))}
                    </td>
                    <td className="text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => onViewInvoice(sale)}
                        className="sepela-link-btn"
                      >
                        {t("common.view")}
                      </button>
                      {canRefund && sale.status !== "refunded" && (
                        <button
                          type="button"
                          onClick={() => onRefund(sale)}
                          className="sepela-link-btn sepela-link-btn--danger"
                        >
                          {t("common.refund")}
                        </button>
                      )}
                      {sale.status === "refunded" && (
                        <span className="sepela-badge text-red-400">
                          {t("common.refunded")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      )}
    </ManagementScreen>
  );
}
