import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Copy, Download, FileText, MessageCircle, Pencil, Plus, Printer, Search, Trash2, User, X } from "lucide-react";
import { isTauriRuntime } from "../db/client";
import ClientStatementPrintBody from "./ClientStatementPrintBody";
import { salesForCustomer } from "../utils/customers";
import {
  filterClientSalesByDateRange,
  formatClientStatementRange,
  formatClientStatementText,
  summarizeClientSales,
} from "../utils/clientStatement";
import { saveNodeAsPdf } from "../utils/domPdf";
import { getInvoiceFormat, getInvoicePageCssSize, getInvoicePdfFormat } from "../utils/invoiceFormats";

const Box = "d" + "iv";

function fieldsFromClient(initial) {
  return {
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    taxNumber: initial?.taxNumber ?? "",
    address: initial?.address ?? "",
    email: initial?.email ?? "",
  };
}

function ClientForm({ initial, onSave, onCancel, saveLabel }) {
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
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-[#0f0f0f] rounded-lg border border-gray-800">
      <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest">{saveLabel}</p>
      <input
        type="text"
        placeholder="Client name *"
        value={fields.name}
        onChange={set("name")}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none"
      />
      <input
        type="text"
        inputMode="tel"
        placeholder="Phone number *"
        value={fields.phone}
        onChange={set("phone")}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none"
      />
      <input
        type="text"
        placeholder="Tax number *"
        value={fields.taxNumber}
        onChange={set("taxNumber")}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm font-mono focus:border-cyan-500 outline-none"
      />
      <textarea
        placeholder="Address"
        value={fields.address}
        onChange={set("address")}
        rows={2}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none resize-none"
      />
      <input
        type="email"
        placeholder="Email"
        value={fields.email}
        onChange={set("email")}
        className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none"
      />
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <Box className="flex gap-2">
        <button
          type="submit"
          className="flex-1 bg-cyan-600 hover:bg-cyan-700 py-2 rounded text-sm font-bold uppercase"
        >
          Save
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded text-sm border border-gray-700 text-gray-400 hover:text-white"
          >
            Cancel
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
  const statementRangeLabel = formatClientStatementRange(statementRange);
  const statementFormatId = invoiceProfile?.defaultPrintFormat || "A4";
  const statementFormat = getInvoiceFormat(statementFormatId);
  const statementText = statementCustomer
    ? formatClientStatementText({
        customer: statementCustomer,
        sales: statementSales,
        profile: invoiceProfile,
        range: statementRange,
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
      alert("Client statement copied.");
    } catch {
      alert("Could not copy the client statement.");
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
      alert("Could not open WhatsApp.");
    }
  };

  const handlePrintStatement = () => {
    if (!statementCustomer || !exportRef.current) return;
    const w = window.open("", "_blank", "width=900,height=720");
    if (!w) {
      alert("Could not open the print window.");
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><title>Statement ${statementCustomer.name}</title>
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
      await saveNodeAsPdf(exportRef.current, `client-statement-${statementCustomer.name}`, {
        format: getInvoicePdfFormat(statementFormatId),
      });
      alert("Client statement PDF saved.");
    } catch (error) {
      alert(`Could not save statement PDF: ${error?.message ?? error}`);
    }
  };

  return (
    <Box className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Box className="bg-[#1a1a1a] border border-gray-800 w-full max-w-5xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <Box className="p-4 border-b border-gray-800 flex justify-between items-center shrink-0">
          <Box>
            <h3 className="font-bold flex items-center gap-2">
              <User className="text-cyan-400" size={20} />
              Client book
            </h3>
            <p className="text-[10px] text-gray-500 mt-1">Saved clients for faster invoicing</p>
          </Box>
          <button type="button" onClick={handleClose} aria-label="Close">
            <X size={20} />
          </button>
        </Box>

        <Box className="p-4 overflow-auto flex-1">
          <Box className="grid grid-cols-1 xl:grid-cols-[1.1fr,0.9fr] gap-4">
            <Box className="space-y-4 min-w-0">
              <Box className="relative">
                <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
                <input
                  type="text"
                  placeholder="Search clients by name, phone, tax, or email"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-gray-700 rounded px-10 py-2 text-sm focus:border-cyan-500 outline-none"
                />
              </Box>

              {!showAddForm && !editingId && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white hover:border-cyan-500"
                >
                  <Plus size={16} />
                  Add client
                </button>
              )}

              {showAddForm && (
                <ClientForm
                  saveLabel="New client"
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
                  saveLabel="Edit client"
                  onSave={async (fields) => {
                    const result = await onUpdate(editingId, fields);
                    if (result.ok) setEditingId(null);
                    return result;
                  }}
                  onCancel={() => setEditingId(null)}
                />
              )}

              {filteredCustomers.length === 0 ? (
                <p className="text-sm text-gray-600 text-center py-6">No saved clients found.</p>
              ) : (
                <ul className="space-y-2">
                  {filteredCustomers.map((customer) => {
                    const invoiceCount = usageCounts.get(customer.id) ?? 0;
                    const isActive = statementCustomerId === customer.id;

                    return (
                      <li
                        key={customer.id}
                        className={`p-3 rounded-lg border ${
                          isActive
                            ? "bg-cyan-950/20 border-cyan-700/60"
                            : "bg-[#252525] border-gray-800"
                        }`}
                      >
                        <Box className="flex items-start justify-between gap-3">
                          <Box className="min-w-0 flex-1">
                            <p className="font-medium text-gray-200">{customer.name}</p>
                            <p className="text-[10px] text-gray-500 mt-1">{customer.phone}</p>
                            <p className="text-[10px] font-mono text-gray-500 mt-1">
                              Tax: {customer.taxNumber}
                            </p>
                            {customer.email && (
                              <p className="text-[10px] text-gray-500 mt-1">{customer.email}</p>
                            )}
                            {customer.address && (
                              <p className="text-[10px] text-gray-600 mt-1 whitespace-pre-wrap">
                                {customer.address}
                              </p>
                            )}
                            <p className="text-[10px] text-cyan-400 mt-2">
                              {invoiceCount} invoice{invoiceCount === 1 ? "" : "s"}
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
                              className="px-2 py-2 rounded text-cyan-400 hover:text-white hover:bg-gray-800 text-[10px] font-bold uppercase"
                            >
                              Statement
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddForm(false);
                                setEditingId(customer.id);
                              }}
                              className="p-2 rounded text-gray-400 hover:text-white hover:bg-gray-800"
                              aria-label={`Edit ${customer.name}`}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.confirm(`Delete "${customer.name}" from saved clients?`)) return;
                                const result = await onDelete(customer.id);
                                if (!result.ok) {
                                  alert(result.error);
                                  return;
                                }
                                if (editingId === customer.id) setEditingId(null);
                                if (statementCustomerId === customer.id) setStatementCustomerId(null);
                              }}
                              className="p-2 rounded text-red-500 hover:bg-red-950/50"
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
              <Box className="bg-[#101010] border border-gray-800 rounded-xl h-full overflow-hidden">
                <Box className="p-4 border-b border-gray-800">
                  <h4 className="font-bold flex items-center gap-2">
                    <FileText className="text-cyan-400" size={18} />
                    Client statement
                  </h4>
                  <p className="text-[10px] text-gray-500 mt-1">
                    View invoice history and totals for one saved client.
                  </p>
                </Box>

                {!statementCustomer ? (
                  <p className="p-4 text-sm text-gray-600">
                    Select a saved client to view their invoice history.
                  </p>
                ) : (
                  <Box className="p-4 space-y-4">
                    <Box className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <Stat label="Client" value={statementCustomer.name} />
                      <Stat
                        label="Invoices"
                        value={String(statementSummary.invoiceCount)}
                        accent="text-cyan-400"
                      />
                      <Stat
                        label="Gross billed"
                        value={`$${statementSummary.grossUSD.toFixed(2)}`}
                        accent="text-green-400"
                      />
                      <Stat
                        label="Net sales"
                        value={`$${statementSummary.netUSD.toFixed(2)}`}
                        accent="text-blue-400"
                      />
                    </Box>

                    <Box className="text-xs text-gray-500">
                      Period: <span className="text-gray-300">{statementRangeLabel}</span>
                    </Box>

                    <Box className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto] gap-2">
                      <input
                        type="date"
                        value={statementFrom}
                        onChange={(e) => setStatementFrom(e.target.value)}
                        className="bg-[#0f0f0f] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-cyan-500"
                      />
                      <input
                        type="date"
                        value={statementTo}
                        onChange={(e) => setStatementTo(e.target.value)}
                        className="bg-[#0f0f0f] border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-cyan-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setStatementFrom("");
                          setStatementTo("");
                        }}
                        className="px-3 py-2 rounded border border-gray-700 text-xs font-bold uppercase tracking-wide text-gray-400 hover:text-white"
                      >
                        Clear
                      </button>
                    </Box>

                    <Box className="text-xs text-gray-500">
                      Last invoice:{" "}
                      <span className="text-gray-300">
                        {statementLastSale
                          ? new Date(statementLastSale.timestamp).toLocaleString()
                          : "No invoices yet"}
                      </span>
                    </Box>

                    <Box className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCopyStatement}
                        className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border border-gray-700 text-gray-200 hover:border-gray-500 flex items-center gap-2"
                      >
                        <Copy size={14} />
                        Copy summary
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenStatementWhatsApp}
                        className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border border-green-700 bg-green-950/30 text-green-400 hover:border-green-500 flex items-center gap-2"
                      >
                        <MessageCircle size={14} />
                        Open WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={handlePrintStatement}
                        className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border border-blue-700 bg-blue-950/30 text-blue-400 hover:border-blue-500 flex items-center gap-2"
                      >
                        <Printer size={14} />
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveStatementPdf}
                        className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border border-emerald-700 bg-emerald-950/30 text-emerald-400 hover:border-emerald-500 flex items-center gap-2"
                      >
                        <Download size={14} />
                        PDF
                      </button>
                    </Box>

                    <pre className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-4 text-xs text-gray-300 whitespace-pre-wrap wrap-break-word font-mono">
                      {statementText}
                    </pre>

                    {statementSales.length === 0 ? (
                      <p className="text-sm text-gray-600 py-6 text-center">
                        No invoices found for this client yet.
                      </p>
                    ) : (
                      <Box className="border border-gray-800 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="text-[10px] uppercase text-gray-500 border-b border-gray-800 bg-[#151515]">
                            <tr>
                              <th className="p-3">Invoice</th>
                              <th className="p-3">When</th>
                              <th className="p-3 text-right">USD</th>
                              <th className="p-3 w-24" />
                            </tr>
                          </thead>
                          <tbody>
                            {statementSales.map((sale) => (
                              <tr key={sale.id} className="border-b border-gray-900">
                                <td className="p-3">
                                  <span className="font-mono text-cyan-400">
                                    {sale.invoiceNumber ?? sale.id}
                                  </span>
                                  {sale.status === "refunded" && (
                                    <span className="block text-[10px] text-red-400 uppercase mt-1">
                                      Refunded
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-xs text-gray-400">
                                  {new Date(sale.timestamp).toLocaleString()}
                                </td>
                                <td className="p-3 text-right font-bold">
                                  ${(sale.totalUSD ?? 0).toFixed(2)}
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => onViewInvoice?.(sale)}
                                    className="text-[10px] font-bold uppercase text-blue-400 hover:underline"
                                  >
                                    View
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
        </Box>
      </Box>
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
    </Box>
  );
}

function Stat({ label, value, accent = "text-white" }) {
  return (
    <Box className="rounded-lg border border-gray-800 bg-[#161616] p-3">
      <p className="text-[10px] uppercase tracking-widest text-gray-500">{label}</p>
      <p className={`mt-1 text-sm font-bold ${accent}`}>{value}</p>
    </Box>
  );
}
