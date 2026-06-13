import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Download, Mail, Printer, X } from "lucide-react";
import InvoicePrintBody from "./InvoicePrintBody";
import { useCurrency } from "../contexts/CurrencyContext";
import { useLocale } from "../contexts/LocaleContext";
import { useNotification } from "../contexts/NotificationContext";
import { formatInvoicePlainText } from "../utils/invoiceText";
import {
  getInvoiceFormat,
  getInvoiceFormatLabel,
  getInvoicePageCssSize,
  INVOICE_FORMATS,
} from "../utils/invoiceFormats";
import { invoicePrintStylesheet, invoiceWidthPx } from "../utils/invoiceCapture";
import { saveInvoiceVectorPdf } from "../utils/invoiceVectorPdf";
import { formatPdfSaveError } from "../utils/savePdfDocument";
import { shareInvoiceByEmail } from "../utils/shareInvoiceEmail";

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
  const { notifySuccess, notifyError } = useNotification();
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

  const handleShareEmail = async () => {
    try {
      const result = await shareInvoiceByEmail({
        sale,
        profile: invoiceProfile,
        receiptContext,
        promotions,
        primaryCurrency,
        exchangeRate,
        locale,
        formatId: format.id,
      });
      if (result.cancelled) {
        notifyError(t("notification.emailCancelled"));
        return;
      }
      if (result.pdfPath) {
        notifySuccess(t("notification.emailOpened", { path: result.pdfPath }));
      } else {
        notifySuccess(t("notification.emailOpenedSimple"));
      }
    } catch (e) {
      console.error(e);
      notifyError(t("invoiceModal.emailFailed", { error: e?.message ?? e }));
    }
  };

  const handleSavePdf = async () => {
    try {
      const raw = String(sale.invoiceNumber ?? sale.id ?? "invoice");
      const safe = raw.replace(/[/\\:*?"<>|]/g, "-").trim().slice(0, 120) || "invoice";
      const savedPath = await saveInvoiceVectorPdf({
        sale,
        profile: invoiceProfile,
        receiptContext,
        promotions,
        primaryCurrency,
        exchangeRate,
        locale,
        formatId: format.id,
        filename: safe,
        dialogTitle: t("notification.invoicePdfSaveTitle"),
      });
      if (!savedPath) return;
      notifySuccess(t("notification.documentSaved", { path: savedPath }));
    } catch (e) {
      console.error(e);
      const formatted = formatPdfSaveError(e);
      notifyError(t(formatted.key, formatted.params));
    }
  };

  const modal = (
    <Box className="sepela-modal-overlay sepela-modal-overlay--fullscreen">
      <Box className="sepela-modal sepela-modal--fullscreen">
        <Box className="sepela-modal-header shrink-0">
          <span className="sepela-modal-title">
            {receiptContext?.receiptType === "COPY" ? t("invoiceModal.copyPrefix") : ""}
            {receiptContext?.receiptType === "PROFORMA" ? t("invoiceModal.proformaPrefix") : ""}
            {receiptContext?.receiptType === "TRAINING" ? t("invoiceModal.trainingPrefix") : ""}
            {t("invoiceModal.title", { number: sale.invoiceNumber ?? sale.id.slice(-10) })}
          </span>
          <Box className="flex gap-2 items-center">
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="sepela-input text-xs !py-1.5 !w-auto"
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
              className="sepela-btn-secondary text-xs"
            >
              <Copy size={14} /> {t("invoiceModal.copy")}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="sepela-btn-primary !w-auto flex items-center gap-1 text-xs px-3 py-1.5"
            >
              <Printer size={14} /> {t("invoiceModal.print")}
            </button>
            <button
              type="button"
              onClick={handleShareEmail}
              className="sepela-btn-secondary text-xs"
              title={sale.customerEmail ? sale.customerEmail : t("invoiceModal.email")}
            >
              <Mail size={14} /> {t("invoiceModal.email")}
            </button>
            <button
              type="button"
              onClick={handleSavePdf}
              className="sepela-btn-secondary text-xs"
            >
              <Download size={14} /> PDF
            </button>
            <button type="button" onClick={onClose} className="text-sepela-muted hover:text-white shrink-0" aria-label={t("common.close")}>
              <X size={22} />
            </button>
          </Box>
        </Box>
        <Box className="sepela-modal-body sepela-scroll flex-1 p-4 bg-[#383838]">
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

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
