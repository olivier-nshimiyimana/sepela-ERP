import CompanyLogo from "./CompanyLogo";
import { useCurrency } from "../contexts/CurrencyContext";
import { useLocale } from "../contexts/LocaleContext";
import { summarizeClientSales } from "../utils/clientStatement";
import { saleExchangeRate } from "../utils/currency";
import { getInvoiceFormat } from "../utils/invoiceFormats";

function formatDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value ?? "");
  }
}

export default function ClientStatementPrintBody({
  customer,
  sales = [],
  profile = {},
  rangeLabel = "All time",
  formatId = "A4",
}) {
  const currency = useCurrency();
  const { t } = useLocale();
  const summary = summarizeClientSales(sales);
  const sortedSales = [...sales].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const format = getInvoiceFormat(formatId);
  const isNarrow = format.widthMm <= 100;
  const compact = format.widthMm <= 140;
  const horizontalPaddingMm = isNarrow ? 4 : compact ? 8 : 12;
  const sectionGap = isNarrow ? 12 : 18;
  const headerTitleSize = isNarrow ? 18 : 28;
  const headerSubtitleSize = isNarrow ? 11 : 12;
  const statsGridColumns = isNarrow ? "1fr" : compact ? "repeat(2, 1fr)" : "repeat(4, 1fr)";

  return (
    <div
      className="client-statement-print-root"
      style={{
        background: "#ffffff",
        color: "#111827",
        fontFamily: "Arial, Helvetica, sans-serif",
        width: "100%",
        margin: 0,
        padding: `${isNarrow ? 6 : 12}mm ${horizontalPaddingMm}mm`,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: isNarrow ? "column" : "row",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <CompanyLogo src={profile.companyLogo} compact={isNarrow} />
          <div>
          <h1 style={{ margin: 0, fontSize: headerTitleSize }}>{profile.companyName || "Sepela ERP"}</h1>
          {profile.companyTagline && (
            <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: headerSubtitleSize }}>
              {profile.companyTagline}
            </p>
          )}
          {profile.phone && (
            <p style={{ margin: "4px 0 0", fontSize: headerSubtitleSize }}>
              {t("receipt.tel", { phone: profile.phone })}
            </p>
          )}
          {profile.email && <p style={{ margin: "2px 0 0", fontSize: headerSubtitleSize }}>{profile.email}</p>}
          </div>
        </div>
        <div style={{ textAlign: isNarrow ? "left" : "right" }}>
          <h2 style={{ margin: 0, fontSize: isNarrow ? 16 : 22 }}>{t("clients.statementHeading")}</h2>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: headerSubtitleSize }}>
            {t("clients.generated", { date: new Date().toLocaleString() })}
          </p>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: headerSubtitleSize }}>
            {t("clients.period")} {rangeLabel}
          </p>
        </div>
      </div>

      <div
        style={{
          marginTop: sectionGap,
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "#f9fafb",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>{customer?.name ?? t("clients.unknownClient")}</div>
        {customer?.phone && (
          <div style={{ marginTop: 4, fontSize: 12 }}>
            {t("common.phone")}: {customer.phone}
          </div>
        )}
        {customer?.taxNumber && (
          <div style={{ marginTop: 4, fontSize: 12 }}>
            {t("clients.taxNumberLabel", { number: customer.taxNumber })}
          </div>
        )}
        {customer?.email && (
          <div style={{ marginTop: 4, fontSize: 12 }}>
            {t("common.email")}: {customer.email}
          </div>
        )}
        {customer?.address && (
          <div style={{ marginTop: 4, fontSize: 12 }}>
            {t("common.address")}: {customer.address}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: statsGridColumns,
          gap: 12,
          marginTop: sectionGap,
        }}
      >
        <Stat label={t("clients.invoicesLabel")} value={String(summary.invoiceCount)} />
        <Stat label={t("common.refunded")} value={String(summary.refundedCount)} />
        <Stat label={t("clients.grossBilled")} value={currency.formatPrimary(summary.grossUSD)} />
        <Stat label={t("clients.netAfterRefunds")} value={currency.formatPrimary(summary.netUSD)} />
      </div>

      {isNarrow ? (
        <div style={{ marginTop: sectionGap, display: "grid", gap: 10 }}>
          {sortedSales.length === 0 ? (
            <div style={{ ...emptyStateStyle, fontSize: 11 }}>{t("clients.noInvoicesYet")}</div>
          ) : (
            sortedSales.map((sale) => (
              <div
                key={sale.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: 10,
                  background: "#ffffff",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700 }}>{sale.invoiceNumber ?? sale.id}</div>
                <div style={{ marginTop: 4, fontSize: 11, color: "#4b5563" }}>{formatDate(sale.timestamp)}</div>
                <div style={{ marginTop: 4, fontSize: 11, color: "#4b5563" }}>
                  {sale.status === "refunded" ? t("common.refunded") : t("clients.statusCompleted")}
                </div>
                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700 }}>
                  {currency.formatPrimary(sale.totalUSD ?? 0, saleExchangeRate(sale))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: sectionGap, fontSize: compact ? 11 : 12 }}>
          <thead>
            <tr style={{ background: "#111827", color: "#ffffff" }}>
              <th style={thStyle(compact)}>{t("invoices.columnInvoice")}</th>
              <th style={thStyle(compact)}>{t("common.date")}</th>
              <th style={thStyle(compact)}>{t("common.status")}</th>
              <th style={{ ...thStyle(compact), textAlign: "right" }}>{currency.primaryCurrency}</th>
            </tr>
          </thead>
          <tbody>
            {sortedSales.length === 0 ? (
              <tr>
                <td style={tdStyle(compact)} colSpan={4}>
                  {t("clients.noInvoicesYet")}
                </td>
              </tr>
            ) : (
              sortedSales.map((sale) => (
                <tr key={sale.id}>
                  <td style={tdStyle(compact)}>{sale.invoiceNumber ?? sale.id}</td>
                  <td style={tdStyle(compact)}>{formatDate(sale.timestamp)}</td>
                  <td style={tdStyle(compact)}>
                    {sale.status === "refunded" ? t("common.refunded") : t("clients.statusCompleted")}
                  </td>
                  <td style={{ ...tdStyle(compact), textAlign: "right", fontWeight: 700 }}>
                    {currency.formatPrimary(sale.totalUSD ?? 0, saleExchangeRate(sale))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 12,
        background: "#ffffff",
      }}
    >
      <div style={{ color: "#6b7280", fontSize: 10, letterSpacing: "0.02em" }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const emptyStateStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  background: "#ffffff",
};

function thStyle(compact) {
  return {
    padding: compact ? "8px 10px" : "10px 12px",
    textAlign: "left",
    fontSize: compact ? 10 : 11,
    letterSpacing: "0.02em",
  };
}

function tdStyle(compact) {
  return {
    padding: compact ? "8px 10px" : "10px 12px",
    borderBottom: "1px solid #e5e7eb",
    wordBreak: "break-word",
  };
}
