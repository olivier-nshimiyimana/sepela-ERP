import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Copy, Download, FileText, MessageCircle, Pencil, Plus, Printer, Search, Trash2, UserCircle } from "lucide-react";
import ManagementScreen from "./ManagementScreen";
import { isTauriRuntime } from "../db/client";
import ClientStatementPrintBody from "./ClientStatementPrintBody";
import { salesForCustomer } from "../utils/customers";
import { useCurrency } from "../contexts/CurrencyContext";
import { useLocale } from "../contexts/LocaleContext";
import { useNotification } from "../contexts/NotificationContext";
import {
  filterClientSalesByDateRange,
  formatClientStatementRange,
  formatClientStatementText,
  summarizeClientSales,
} from "../utils/clientStatement";
import { saleExchangeRate } from "../utils/currency";
import { saveNodeAsPdf } from "../utils/domPdf";
import { formatPdfSaveError } from "../utils/savePdfDocument";
import { getInvoiceFormat, getInvoicePageCssSize, getInvoicePdfFormat } from "../utils/invoiceFormats";
import { formatDisplayTitle } from "../utils/uiText";

const Box = "d" + "iv";

function fieldsFromClient(initial) {
  return {
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    taxNumber: initial?.taxNumber ?? "",
    address: initial?.address ?? "",
    email: initial?.email ?? "",
    clientTier: initial?.clientTier ?? "",
  };
}

function ClientForm({ initial, onSave, onCancel, saveLabel }) {
  const { t, tError } = useLocale();
  const [fields, setFields] = useState(fieldsFromClient(initial));
  const [error, setError] = useState("");

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await onSave(fields);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!initial) setFields(fieldsFromClient(null));
    setError("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 sepela-panel">
      <p className="sepela-label">{saveLabel}</p>
      <input
        type="text"
        placeholder={t("clients.clientName")}
        value={fields.name}
        onChange={set("name")}
        className="sepela-input"
      />
      <input
        type="text"
        inputMode="tel"
        placeholder={`${t("common.phone")} *`}
        value={fields.phone}
        onChange={set("phone")}
        className="sepela-input"
      />
      <input
        type="text"
        placeholder={`${t("payment.taxNumber")} *`}
        value={fields.taxNumber}
        onChange={set("taxNumber")}
        className="sepela-input font-mono"
      />
      <textarea
        placeholder={t("common.address")}
        value={fields.address}
        onChange={set("address")}
        rows={2}
        className="sepela-input resize-none"
      />
      <input
        type="email"
        placeholder={t("common.email")}
        value={fields.email}
        onChange={set("email")}
        className="sepela-input"
      />
      <input
        type="text"
        placeholder={t("clients.clientTier")}
        value={fields.clientTier}
        onChange={set("clientTier")}
        className="sepela-input"
      />
      {error && <p className="text-red-400 text-xs">{tError(error)}</p>}
      <Box className="flex gap-2">
        <button
          type="submit"
          className="sepela-btn-primary flex-1"
        >
          {t("common.save")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="sepela-btn-secondary"
          >
            {t("common.cancel")}
          </button>
        )}
      </Box>
    </form>
  );
}

export default function ClientManageModal({
  isOpen,
  customers,
  sales,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
  onViewInvoice,
  invoiceProfile,
}) {
  const currency = useCurrency();
  const { t, tError, locale } = useLocale();
  const { notifySuccess, notifyError } = useNotification();
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statementCustomerId, setStatementCustomerId] = useState(null);
  const [statementFrom, setStatementFrom] = useState("");
  const [statementTo, setStatementTo] = useState("");
  const exportRef = useRef(null);

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        String(customer.phone ?? "").toLowerCase().includes(term) ||
        String(customer.taxNumber ?? "").toLowerCase().includes(term) ||
        String(customer.email ?? "").toLowerCase().includes(term)
    );
  }, [customers, searchTerm]);

  const usageCounts = useMemo(() => {
    const counts = new Map();
    for (const customer of customers ?? []) {
      counts.set(customer.id, salesForCustomer(sales ?? [], customer).length);
    }
    return counts;
  }, [customers, sales]);

  if (!isOpen) return null;

  const editingCustomer = customers.find((customer) => customer.id === editingId);
  const statementCustomer = customers.find((customer) => customer.id === statementCustomerId) ?? null;
  const statementRange = { from: statementFrom, to: statementTo };
  const statementSales = statementCustomer
    ? filterClientSalesByDateRange(salesForCustomer(sales ?? [], statementCustomer), statementRange).sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      )
    : [];
  const statementSummary = summarizeClientSales(statementSales);
  const statementLastSale = statementSales[0] ?? null;
  const statementRangeLabel = formatClientStatementRange(statementRange, locale);
  const statementFormatId = invoiceProfile?.defaultPrintFormat || "A4";
  const statementFormat = getInvoiceFormat(statementFormatId);
  const statementText = statementCustomer
    ? formatClientStatementText({
        customer: statementCustomer,
        sales: statementSales,
        profile: invoiceProfile,
        range: statementRange,
        exchangeRate: currency.exchangeRate,
        primaryCurrency: currency.primaryCurrency,
        locale,
      })
    : "";

  const handleClose = () => {
    setEditingId(null);
    setShowAddForm(false);
    setSearchTerm("");
    setStatementCustomerId(null);
    setStatementFrom("");
    setStatementTo("");
    onClose();
  };

  const handleCopyStatement = async () => {
    if (!statementText) return;
    try {
      await navigator.clipboard.writeText(statementText);
      alert(t("clients.copied"));
    } catch {
      alert(t("clients.copyFailed"));
    }
  };

  const handleOpenStatementWhatsApp = async () => {
    if (!statementText) return;
    const url = `https://wa.me/?text=${encodeURIComponent(statementText)}`;
    try {
      if (isTauriRuntime()) {
        await openUrl(url);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      alert(t("clients.openWhatsAppFailed"));
    }
  };

  const handlePrintStatement = () => {
    if (!statementCustomer || !exportRef.current) return;
    const w = window.open("", "_blank", "width=900,height=720");
    if (!w) {
      alert(t("clients.printFailed"));
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><title>${t("clients.statementDocTitle", { name: statementCustomer.name })}</title>
      <style>
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #fff; color: #111827; }
        .sheet {
          width: ${statementFormat.widthMm}mm;
          max-width: 100%;
          margin: 0 auto;
          background: #fff;
        }
        @page { size: ${getInvoicePageCssSize(statementFormatId)}; margin: ${
          statementFormat.id === "THERMAL_80" ? "4mm" : "10mm"
        }; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body><div class="sheet">${exportRef.current.innerHTML}</div></body></html>`);
    w.document.close();
    const triggerPrint = () => {
      w.focus();
      w.print();
    };
    w.onload = () => {
      window.setTimeout(triggerPrint, 150);
    };
    window.setTimeout(triggerPrint, 350);
  };

  const handleSaveStatementPdf = async () => {
    if (!statementCustomer || !exportRef.current) return;
    try {
      const savedPath = await saveNodeAsPdf(exportRef.current, `client-statement-${statementCustomer.name}`, {
        format: getInvoicePdfFormat(statementFormatId),
      });
      if (!savedPath) return;
      notifySuccess(t("notification.documentSaved", { path: savedPath }));
    } catch (error) {
      const formatted = formatPdfSaveError(error);
      notifyError(t(formatted.key, formatted.params));
    }
  };

  return (
  <>
    <ManagementScreen
      isOpen={isOpen}
      onClose={handleClose}
      title={t("clients.title")}
      icon={UserCircle}
      subtitle={t("clients.subtitle")}
      wide
    >
      <Box className="grid grid-cols-1 xl:grid-cols-[1.1fr,0.9fr] gap-4">
            <Box className="space-y-4 min-w-0">
              <Box className="sepela-search-wrap">
                <Search className="sepela-search-icon" size={16} />
                <input
                  type="text"
                  placeholder={t("clients.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="sepela-input"
                />
              </Box>

              {!showAddForm && !editingId && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="sepela-dashed-btn"
                >
                  <Plus size={16} />
                  {t("clients.addClient")}
                </button>
              )}

              {showAddForm && (
                <ClientForm
                  saveLabel={t("clients.newClient")}
                  onSave={async (fields) => {
                    const result = await onAdd(fields);
                    if (result.ok) setShowAddForm(false);
                    return result;
                  }}
                  onCancel={() => setShowAddForm(false)}
                />
              )}

              {editingId && editingCustomer && (
                <ClientForm
                  key={editingId}
                  initial={editingCustomer}
                  saveLabel={t("clients.editClient")}
                  onSave={async (fields) => {
                    const result = await onUpdate(editingId, fields);
                    if (result.ok) setEditingId(null);
                    return result;
                  }}
                  onCancel={() => setEditingId(null)}
                />
              )}

              {filteredCustomers.length === 0 ? (
                <p className="text-sm sepela-hint text-center py-6">{t("clients.noClients")}</p>
              ) : (
                <ul className="space-y-2">
                  {filteredCustomers.map((customer) => {
                    const invoiceCount = usageCounts.get(customer.id) ?? 0;
                    const isActive = statementCustomerId === customer.id;

                    return (
                      <li
                        key={customer.id}
                        className={`sepela-card-item ${isActive ? "sepela-card-item--active" : ""}`}
                      >
                        <Box className="flex items-start justify-between gap-3">
                          <Box className="min-w-0 flex-1">
                            <p className="sepela-card-item__title">{formatDisplayTitle(customer.name)}</p>
                            <p className="sepela-card-item__meta">{customer.phone}</p>
                            <p className="sepela-card-item__meta font-mono">
                              {t("clients.taxLabel", { number: customer.taxNumber })}
                            </p>
                            {customer.email && (
                              <p className="sepela-card-item__meta">{customer.email}</p>
                            )}
                            {customer.address && (
                              <p className="sepela-card-item__meta whitespace-pre-wrap">
                                {formatDisplayTitle(customer.address)}
                              </p>
                            )}
                            <p className="sepela-card-item__meta text-sepela-accent font-bold mt-2">
                              {invoiceCount === 1
                                ? t("clients.invoiceCount", { count: invoiceCount })
                                : t("clients.invoiceCountPlural", { count: invoiceCount })}
                            </p>
                          </Box>
                          <Box className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setStatementCustomerId((prev) =>
                                  prev === customer.id ? null : customer.id
                                );
                              }}
                              className="sepela-btn-secondary text-xs !py-2 !w-auto"
                            >
                              {t("clients.statement")}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddForm(false);
                                setEditingId(customer.id);
                              }}
                              className="sepela-icon-btn sepela-icon-btn--accent"
                              aria-label={`Edit ${customer.name}`}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.confirm(t("clients.deleteConfirm", { name: customer.name }))) return;
                                const result = await onDelete(customer.id);
                                if (!result.ok) {
                                  alert(tError(result.error));
                                  return;
                                }
                                if (editingId === customer.id) setEditingId(null);
                                if (statementCustomerId === customer.id) setStatementCustomerId(null);
                              }}
                              className="sepela-icon-btn sepela-icon-btn--danger"
                              aria-label={`Delete ${customer.name}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </Box>
                        </Box>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Box>

            <Box className="min-w-0">
              <Box className="sepela-subpanel h-full">
                <Box className="sepela-subpanel-header">
                  <h4 className="sepela-section-title flex items-center gap-2">
                    <FileText className="text-sepela-accent" size={18} />
                    {t("clients.statementTitle")}
                  </h4>
                  <p className="sepela-hint mt-1">
                    {t("clients.statementSubtitle")}
                  </p>
                </Box>

                {!statementCustomer ? (
                  <p className="p-4 text-sm sepela-hint">
                    {t("clients.selectClient")}
                  </p>
                ) : (
                  <Box className="p-4 space-y-4">
                    <Box className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <Stat label={t("common.client")} value={formatDisplayTitle(statementCustomer.name)} />
                      <Stat
                        label={t("clients.invoicesLabel")}
                        value={String(statementSummary.invoiceCount)}
                        accent="sepela-stat__value--accent"
                      />
                      <Stat
                        label={t("clients.grossBilled")}
                        value={currency.formatPrimary(statementSummary.grossUSD)}
                        accent="text-emerald-400"
                      />
                      <Stat
                        label={t("clients.netSales")}
                        value={currency.formatPrimary(statementSummary.netUSD)}
                        accent="text-sepela-accent"
                      />
                    </Box>

                    <Box className="text-xs sepela-text-secondary">
                      {t("clients.period")} <span className="sepela-text-muted">{statementRangeLabel}</span>
                    </Box>

                    <Box className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto] gap-2">
                      <input
                        type="date"
                        value={statementFrom}
                        onChange={(e) => setStatementFrom(e.target.value)}
                        className="sepela-input"
                      />
                      <input
                        type="date"
                        value={statementTo}
                        onChange={(e) => setStatementTo(e.target.value)}
                        className="sepela-input"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setStatementFrom("");
                          setStatementTo("");
                        }}
                        className="sepela-btn-secondary text-xs"
                      >
                        {t("common.clear")}
                      </button>
                    </Box>

                    <Box className="text-xs sepela-text-secondary">
                      {t("clients.lastInvoice")}{" "}
                      <span className="sepela-text-muted">
                        {statementLastSale
                          ? new Date(statementLastSale.timestamp).toLocaleString()
                          : t("clients.noInvoicesYet")}
                      </span>
                    </Box>

                    <Box className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCopyStatement}
                        className="sepela-btn-secondary text-xs flex items-center gap-2"
                      >
                        <Copy size={14} />
                        {t("reports.copySummary")}
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenStatementWhatsApp}
                        className="sepela-btn-secondary text-xs flex items-center gap-2 text-emerald-400"
                      >
                        <MessageCircle size={14} />
                        {t("reports.openWhatsApp")}
                      </button>
                      <button
                        type="button"
                        onClick={handlePrintStatement}
                        className="sepela-btn-secondary text-xs flex items-center gap-2 text-sepela-accent"
                      >
                        <Printer size={14} />
                        {t("invoiceModal.print")}
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveStatementPdf}
                        className="sepela-btn-secondary text-xs flex items-center gap-2 text-emerald-400"
                      >
                        <Download size={14} />
                        PDF
                      </button>
                    </Box>

                    <pre className="sepela-panel text-xs text-sepela-muted whitespace-pre-wrap wrap-break-word font-mono">
                      {statementText}
                    </pre>

                    {statementSales.length === 0 ? (
                      <p className="text-sm sepela-hint py-6 text-center">
                        {t("clients.noInvoicesForClient")}
                      </p>
                    ) : (
                      <Box className="sepela-subpanel overflow-hidden">
                        <table className="sepela-table text-sm">
                          <thead>
                            <tr>
                              <th className="p-3">{t("invoices.columnInvoice")}</th>
                              <th className="p-3">{t("invoices.columnWhen")}</th>
                              <th className="p-3 text-right">{currency.primaryCurrency}</th>
                              <th className="p-3 w-24" />
                            </tr>
                          </thead>
                          <tbody>
                            {statementSales.map((sale) => (
                              <tr key={sale.id} className="sepela-row-divider">
                                <td className="p-3">
                                  <span className="font-mono text-sepela-accent">
                                    {sale.invoiceNumber ?? sale.id}
                                  </span>
                                  {sale.status === "refunded" && (
                                    <span className="sepela-badge block text-red-400 mt-1">
                                      {t("common.refunded")}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-xs sepela-text-secondary">
                                  {new Date(sale.timestamp).toLocaleString()}
                                </td>
                                <td className="p-3 text-right font-bold">
                                  {currency.formatPrimary(sale.totalUSD ?? 0, saleExchangeRate(sale))}
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => onViewInvoice?.(sale)}
                                    className="sepela-link-btn"
                                  >
                                    {t("common.view")}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
      </Box>
    </ManagementScreen>
      {statementCustomer &&
        createPortal(
          <div
            aria-hidden
            style={{
              position: "fixed",
              left: "-10000px",
              top: 0,
              pointerEvents: "none",
              width: "auto",
              height: "auto",
              overflow: "visible",
            }}
          >
            <div
              ref={exportRef}
              style={{
                width: `${statementFormat.widthMm}mm`,
                margin: 0,
                display: "block",
                boxSizing: "border-box",
              }}
            >
              <ClientStatementPrintBody
                customer={statementCustomer}
                sales={statementSales}
                profile={invoiceProfile}
                rangeLabel={statementRangeLabel}
                formatId={statementFormatId}
              />
            </div>
          </div>,
          document.body
        )}
  </>
  );
}

function Stat({ label, value, accent = "text-white" }) {
  return (
    <Box className="sepela-stat">
      <p className="sepela-stat__label">{label}</p>
      <p className={`sepela-stat__value ${accent}`}>{value}</p>
    </Box>
  );
}
