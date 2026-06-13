import { PLATFORM_PRODUCT_NAME } from "../data/platformBranding";
import { DEFAULT_LOCALE, translate } from "../i18n";
import {
  DEFAULT_PRIMARY_CURRENCY,
  formatMoneyPairLine,
  formatMoneyPrimary,
  normalizePrimaryCurrency,
  saleExchangeRate,
} from "./currency";
import { roundCdf, roundUsd } from "./moneyRounding";

export function summarizeClientSales(sales = []) {
  const invoiceCount = sales.length;
  const refundedSales = sales.filter((sale) => sale.status === "refunded");
  const refundedCount = refundedSales.length;
  const grossUSD = sales.reduce((sum, sale) => sum + (sale.totalUSD ?? 0), 0);
  const grossCDF = sales.reduce((sum, sale) => sum + (sale.totalCDF ?? 0), 0);
  const refundedUSD = refundedSales.reduce((sum, sale) => sum + (sale.totalUSD ?? 0), 0);
  const refundedCDF = refundedSales.reduce((sum, sale) => sum + (sale.totalCDF ?? 0), 0);

  return {
    invoiceCount,
    refundedCount,
    grossUSD: roundUsd(grossUSD),
    grossCDF: roundCdf(grossCDF),
    refundedUSD: roundUsd(refundedUSD),
    refundedCDF: roundCdf(refundedCDF),
    netUSD: roundUsd(grossUSD - refundedUSD),
    netCDF: roundCdf(grossCDF - refundedCDF),
  };
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function filterClientSalesByDateRange(sales = [], { from = "", to = "" } = {}) {
  const hasFrom = String(from ?? "").trim().length > 0;
  const hasTo = String(to ?? "").trim().length > 0;
  if (!hasFrom && !hasTo) return sales;

  const fromDate = hasFrom ? startOfDay(from) : null;
  const toDate = hasTo ? endOfDay(to) : null;

  return sales.filter((sale) => {
    const timestamp = new Date(sale.timestamp);
    if (Number.isNaN(timestamp.getTime())) return false;
    if (fromDate && timestamp < fromDate) return false;
    if (toDate && timestamp > toDate) return false;
    return true;
  });
}

export function formatClientStatementRange({ from = "", to = "" } = {}, locale = DEFAULT_LOCALE) {
  const fromText = String(from ?? "").trim();
  const toText = String(to ?? "").trim();
  if (fromText && toText) {
    return translate("clients.rangeFromTo", locale, { from: fromText, to: toText });
  }
  if (fromText) return translate("clients.rangeFrom", locale, { from: fromText });
  if (toText) return translate("clients.rangeUpTo", locale, { to: toText });
  return translate("clients.rangeAllTime", locale);
}

function formatStatementDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value ?? "");
  }
}

export function formatClientStatementText({
  customer,
  sales = [],
  profile = {},
  range = {},
  exchangeRate = 2850,
  primaryCurrency = DEFAULT_PRIMARY_CURRENCY,
  locale = DEFAULT_LOCALE,
}) {
  const summary = summarizeClientSales(sales);
  const primary = normalizePrimaryCurrency(primaryCurrency);
  const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 2850;
  const companyName = profile.companyName?.trim() || PLATFORM_PRODUCT_NAME;
  const rangeLabel = formatClientStatementRange(range, locale);
  const t = (key, params) => translate(key, locale, params);

  const lines = [
    t("clients.statementTextTitle", { company: companyName }),
    `${t("common.client")}: ${customer?.name ?? t("clients.unknownClient")}`,
    customer?.phone ? `${t("common.phone")}: ${customer.phone}` : null,
    customer?.taxNumber ? `${t("payment.taxNumber")}: ${customer.taxNumber}` : null,
    customer?.email ? `${t("common.email")}: ${customer.email}` : null,
    customer?.address ? `${t("common.address")}: ${customer.address}` : null,
    "",
    `${t("clients.period")} ${rangeLabel}`,
    `${t("clients.invoicesLabel")}: ${summary.invoiceCount}`,
    t("clients.refundedCount", { count: summary.refundedCount }),
    t("clients.grossBilledLine", {
      amount: formatMoneyPairLine(summary.grossUSD, rate, primary),
    }),
    t("clients.netAfterRefundsLine", {
      amount: formatMoneyPairLine(summary.netUSD, rate, primary),
    }),
    "",
    t("clients.recentInvoices"),
  ];

  const recentSales = [...sales]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 20);

  if (recentSales.length === 0) {
    lines.push(t("clients.noInvoicesLine"));
  } else {
    for (const sale of recentSales) {
      lines.push(
        t("clients.invoiceLine", {
          invoice: sale.invoiceNumber ?? sale.id,
          date: formatStatementDate(sale.timestamp),
          amount: formatMoneyPrimary(sale.totalUSD ?? 0, saleExchangeRate(sale, rate), primary),
          status:
            sale.status === "refunded"
              ? t("clients.statusRefunded")
              : t("clients.statusCompletedUpper"),
        })
      );
    }
    if (sales.length > recentSales.length) {
      lines.push(t("clients.moreInvoices", { count: sales.length - recentSales.length }));
    }
  }

  return lines.filter(Boolean).join("\n");
}
