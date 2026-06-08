import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Download, Printer, X } from "lucide-react";
import InvoicePrintBody from "./InvoicePrintBody";
import { useCurrency } from "../contexts/CurrencyContext";
import { useLocale } from "../contexts/LocaleContext";
import { formatInvoicePlainText } from "../utils/invoiceText";
import {
  getInvoiceFormat,
  getInvoiceFormatLabel,
  getInvoicePageCssSize,
  getInvoicePdfFormat,
  INVOICE_FORMATS,
} from "../utils/invoiceFormats";
import { invoicePrintStylesheet, invoiceWidthPx } from "../utils/invoiceCapture";
import { saveInvoiceAsPdf } from "../utils/domPdf";

const Box = "d" + "iv";

export default function InvoiceModal({
  isOpen,
  sale,
  invoiceProfile,
  receiptContext,
  promotions = [],
  onClose,
}) {
  const { primaryCurrency, exchangeRate } = useCurrency();
  const { t, locale } = useLocale();
  const previewRef = useRef(null);
  const captureRef = useRef(null);
  const [selectedFormat, setSelectedFormat] = useState(
    invoiceProfile.defaultPrintFormat || "A4"
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedFormat(invoiceProfile.defaultPrintFormat || "A4");
    }
  }, [isOpen, invoiceProfile.defaultPrintFormat]);

  const format = getInvoiceFormat(selectedFormat);
  if (!isOpen || !sale) return null;

  const captureWidthPx = invoiceWidthPx(format.widthMm);
  const sheetStyle = {
    width: `${format.widthMm}mm`,
    maxWidth: "100%",
    minHeight: `${format.minHeightMm}mm`,
    margin: "0 auto",
    background: "#ffffff",
  };
  const captureSheetStyle = {
    width: `${captureWidthPx}px`,
    margin: 0,
    background: "#ffffff",
  };

  const plain = formatInvoicePlainText(sale, invoiceProfile, {
    ...(receiptContext ?? {}),
    primaryCurrency,
    exchangeRate,
    locale,
    promotions,
  });

  const invoiceBody = (
    <InvoicePrintBody
      sale={sale}
      profile={invoiceProfile}
      formatId={format.id}
      receiptContext={receiptContext}
      promotions={promotions}
    />
  );

  function getCaptureRoot() {
    const wrap = captureRef.current;
    if (!wrap) return null;
    return wrap.querySelector(".invoice-print-root") ?? wrap;
  }

  const handlePrint = () => {
    const root = getCaptureRoot();
    if (!root) return;
    const w = window.open("", "_blank", "width=420,height=720");
    if (!w) return;
    const pageSize = getInvoicePageCssSize(format.id);
    const invoiceCss = invoicePrintStylesheet();
    w.document.write(`<!DOCTYPE html><html><head><title>${t("invoiceModal.printTitle", { number: sale.invoiceNumber ?? sale.id })}</title>
      <style>
        ${invoiceCss}
        body { margin: 0; font-family: "Segoe UI", Arial, Helvetica, sans-serif; background: #fff; }
        .sheet {
          width: ${format.widthMm}mm;
          min-height: 0;
          margin: 0 auto;
          background: #fff;
        }
        @page {
          size: ${pageSize};
          margin: 8mm;
        }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body><div class="sheet">${root.outerHTML}</div></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plain);
      alert(t("invoiceModal.copied"));
    } catch {
      alert(t("invoiceModal.copyFailed"));
    }
  };

  const handleSavePdf = async () => {
    const node = getCaptureRoot();
    if (!node) return;
    try {
      const raw = String(sale.invoiceNumber ?? sale.id ?? "invoice");
      const safe = raw.replace(/[/\\:*?"<>|]/g, "-").trim().slice(0, 120) || "invoice";
      await saveInvoiceAsPdf(node, safe, { format: getInvoicePdfFormat(format.id) });
      alert(t("invoiceModal.pdfSaved"));
    } catch (e) {
      console.error(e);
      alert(t("invoiceModal.pdfFailed", { error: e?.message ?? e }));
    }
  };

  return (
    <Box className="absolute inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto">
      <Box className="bg-[#1a1a1a] border border-gray-800 w-full max-w-4xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
        <Box className="p-3 border-b border-gray-800 flex justify-between items-center shrink-0">
          <span className="font-bold text-white">
            {receiptContext?.receiptType === "COPY" ? t("invoiceModal.copyPrefix") : ""}
            {receiptContext?.receiptType === "PROFORMA" ? t("invoiceModal.proformaPrefix") : ""}
            {receiptContext?.receiptType === "TRAINING" ? t("invoiceModal.trainingPrefix") : ""}
            {t("invoiceModal.title", { number: sale.invoiceNumber ?? sale.id.slice(-10) })}
          </span>
          <Box className="flex gap-2 items-center">
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="bg-[#0a0a0a] border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200"
            >
              {INVOICE_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {getInvoiceFormatLabel(f.id, locale)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-600 text-xs font-bold uppercase text-gray-300 hover:bg-gray-800"
            >
              <Copy size={14} /> {t("invoiceModal.copy")}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-blue-600 text-xs font-bold uppercase hover:bg-blue-700"
            >
              <Printer size={14} /> {t("invoiceModal.print")}
            </button>
            <button
              type="button"
              onClick={handleSavePdf}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-600 text-xs font-bold uppercase hover:bg-emerald-700"
            >
              <Download size={14} /> PDF
            </button>
            <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-white" aria-label={t("common.close")}>
              <X size={20} />
            </button>
          </Box>
        </Box>
        <Box className="overflow-y-auto flex-1 p-2 bg-gray-300">
          <div ref={previewRef} style={sheetStyle}>
            {invoiceBody}
          </div>
        </Box>
      </Box>

      {createPortal(
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: "-12000px",
            top: 0,
            width: captureWidthPx,
            overflow: "visible",
            pointerEvents: "none",
            background: "#ffffff",
          }}
        >
          <div ref={captureRef} style={captureSheetStyle}>
            {invoiceBody}
          </div>
        </div>,
        document.body
      )}
    </Box>
  );
}
