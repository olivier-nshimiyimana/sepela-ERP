import { useEffect, useMemo, useState } from "react";
import { Calendar, FileText, Search, X } from "lucide-react";
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
    <Box className="absolute inset-0 z-[55] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Box className="bg-[#1a1a1a] border border-gray-800 w-full max-w-4xl max-h-[92vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <Box className="p-4 border-b border-gray-800 flex justify-between items-center shrink-0">
          <h3 className="font-bold flex items-center gap-2">
            <FileText className="text-cyan-400" size={20} />
            {t("invoices.title")}
          </h3>
          <button type="button" onClick={onClose} aria-label={t("common.close")}>
            <X size={20} />
          </button>
        </Box>

        <Box className="p-3 border-b border-gray-900 space-y-3 shrink-0">
          <Box className="flex flex-wrap gap-2">
            {PRESET_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => applyPreset(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition ${
                  preset === id
                    ? "bg-cyan-950/60 border-cyan-600 text-cyan-300"
                    : "bg-[#0a0a0a] border-gray-800 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                }`}
              >
                {t(PRESET_KEYS[id])}
              </button>
            ))}
            <span className="ml-auto self-center text-xs text-gray-500">
              {filtered.length}{" "}
              {filtered.length === 1 ? t("common.invoice") : t("common.invoices")}
            </span>
          </Box>

          <Box className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <label className="grid gap-1 text-[10px] uppercase tracking-wide text-gray-500 font-bold">
              {t("common.fromDate")}
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleDateChange("from", e.target.value)}
                className="bg-[#0a0a0a] border border-gray-800 rounded-lg py-2 px-2.5 text-sm text-gray-100 focus:border-cyan-600 outline-none"
              />
            </label>
            <label className="grid gap-1 text-[10px] uppercase tracking-wide text-gray-500 font-bold">
              {t("common.fromTime")}
              <input
                type="time"
                value={timeFrom}
                onChange={(e) => handleDateChange("timeFrom", e.target.value)}
                className="bg-[#0a0a0a] border border-gray-800 rounded-lg py-2 px-2.5 text-sm text-gray-100 focus:border-cyan-600 outline-none"
              />
            </label>
            <label className="grid gap-1 text-[10px] uppercase tracking-wide text-gray-500 font-bold">
              {t("common.toDate")}
              <input
                type="date"
                value={dateTo}
                onChange={(e) => handleDateChange("to", e.target.value)}
                className="bg-[#0a0a0a] border border-gray-800 rounded-lg py-2 px-2.5 text-sm text-gray-100 focus:border-cyan-600 outline-none"
              />
            </label>
            <label className="grid gap-1 text-[10px] uppercase tracking-wide text-gray-500 font-bold">
              {t("common.toTime")}
              <input
                type="time"
                value={timeTo}
                onChange={(e) => handleDateChange("timeTo", e.target.value)}
                className="bg-[#0a0a0a] border border-gray-800 rounded-lg py-2 px-2.5 text-sm text-gray-100 focus:border-cyan-600 outline-none"
              />
            </label>
          </Box>

          <Box className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
            <input
              type="text"
              placeholder={t("invoices.searchPlaceholder")}
              className="w-full bg-[#0a0a0a] border border-gray-800 rounded-lg py-2 pl-9 pr-3 text-sm focus:border-cyan-600 outline-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Box>

          {(dateFrom || dateTo || timeFrom || timeTo) && (
            <Box className="flex items-center gap-2 text-xs text-gray-500">
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

        <Box className="overflow-auto flex-1 min-h-0 p-2">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-600 text-sm py-8">
              {t("invoices.noInvoices")}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase text-gray-500 border-b border-gray-800 sticky top-0 bg-[#1a1a1a] z-10">
                <tr>
                  <th className="p-2">{t("invoices.columnInvoice")}</th>
                  <th className="p-2">{t("invoices.columnWhen")}</th>
                  <th className="p-2">{t("invoices.columnCashier")}</th>
                  <th className="p-2">{t("invoices.columnPromotion")}</th>
                  <th className="p-2 text-right">{currency.primaryCurrency}</th>
                  <th className="p-2 w-36" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((sale) => {
                  const promoDiscount = salePromotionDiscountUsd(sale);
                  const promoName = saleAppliedPromotionName(sale, promotions);
                  return (
                  <tr key={sale.id} className="border-b border-gray-900 hover:bg-[#252525]">
                    <td className="p-2 font-mono font-bold text-cyan-400">
                      {sale.invoiceNumber ?? `— ${sale.id.slice(-6)}`}
                    </td>
                    <td className="p-2 text-gray-400 whitespace-nowrap text-xs">
                      {new Date(sale.timestamp).toLocaleString()}
                    </td>
                    <td className="p-2 text-xs">{sale.cashierName}</td>
                    <td className="p-2 text-xs">
                      {saleHasPromotionDiscount(sale) ? (
                        <Box>
                          <span className="block text-emerald-400 font-bold">
                            -{currency.formatPrimary(promoDiscount, saleExchangeRate(sale))}
                          </span>
                          {promoName ? (
                            <span className="block text-[10px] text-gray-500 truncate max-w-[140px]">
                              {promoName}
                            </span>
                          ) : null}
                        </Box>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="p-2 text-right font-bold">
                      {currency.formatPrimary(sale.totalUSD ?? 0, saleExchangeRate(sale))}
                    </td>
                    <td className="p-2 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => onViewInvoice(sale)}
                        className="text-[10px] font-bold uppercase text-blue-400 hover:underline"
                      >
                        {t("common.view")}
                      </button>
                      {canRefund && sale.status !== "refunded" && (
                        <button
                          type="button"
                          onClick={() => onRefund(sale)}
                          className="text-[10px] font-bold uppercase text-red-400 hover:underline"
                        >
                          {t("common.refund")}
                        </button>
                      )}
                      {sale.status === "refunded" && (
                        <span className="text-[10px] text-red-500 font-bold uppercase">
                          {t("common.refunded")}
                        </span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Box>
      </Box>
    </Box>
  );
}
