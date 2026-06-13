import { formatInvoicePlainText } from "./invoiceText";
import { saveInvoiceVectorPdf } from "./invoiceVectorPdf";
import { shareInvoiceByEmail } from "./shareInvoiceEmail";
import { formatPdfSaveError } from "./savePdfDocument";

export function printReceiptText(sale, profile, ctx = {}) {
  const plain = formatInvoicePlainText(sale, profile, ctx);
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) throw new Error("printBlocked");
  const title = sale.invoiceNumber ?? sale.id ?? "Receipt";
  w.document.write(
    `<!DOCTYPE html><html><head><title>${title}</title><style>
      body { margin: 12px; font: 12px/1.35 Consolas, "Courier New", monospace; white-space: pre-wrap; }
    </style></head><body></body></html>`
  );
  w.document.body.textContent = plain;
  w.document.close();
  w.focus();
  w.print();
}

export async function saveInvoicePdfFile(sale, profile, options = {}) {
  const raw = String(sale.invoiceNumber ?? sale.id ?? "invoice");
  const safe = raw.replace(/[/\\:*?"<>|]/g, "-").trim().slice(0, 120) || "invoice";
  return saveInvoiceVectorPdf({
    sale,
    profile,
    filename: safe,
    ...options,
  });
}

export async function emailInvoice(sale, profile, options = {}) {
  return shareInvoiceByEmail({ sale, profile, ...options });
}

export function formatInvoiceActionError(error) {
  if (String(error?.message ?? error) === "printBlocked") {
    return { key: "payment.printBlocked" };
  }
  return formatPdfSaveError(error);
}
