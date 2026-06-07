import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Download, Printer, X } from "lucide-react";
import InvoicePrintBody from "./InvoicePrintBody";
import { useCurrency } from "../contexts/CurrencyContext";
import { useLocale } from "../contexts/LocaleContext";
import { formatInvoicePlainText } from "../utils/invoiceText";
import { getInvoiceFormat, getInvoiceFormatLabel, INVOICE_FORMATS } from "../utils/invoiceFormats";

const Box = "d" + "iv";

/** Drop blank rows from bottom of raster (fixes inflated capture height). */
function trimCanvasBottomWhitespace(canvas, opts = {}) {
  const { minKeep = 40, whiteMin = 248 } = opts;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  if (height <= minKeep) return canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  const rowHasNonWhite = (y) => {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = row + x * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 8) continue;
      if (r < whiteMin || g < whiteMin || b < whiteMin) return true;
    }
    return false;
  };

  let bottom = height;
  while (bottom > minKeep && !rowHasNonWhite(bottom - 1)) bottom -= 1;
  if (bottom >= height) return canvas;

  const trimmed = document.createElement("canvas");
  trimmed.width = width;
  trimmed.height = bottom;
  trimmed.getContext("2d").drawImage(canvas, 0, 0, width, bottom, 0, 0, width, bottom);
  return trimmed;
}

export default function InvoiceModal({ isOpen, sale, invoiceProfile, receiptContext, onClose }) {
  const { primaryCurrency, exchangeRate } = useCurrency();
  const { t, locale } = useLocale();
  const previewRef = useRef(null);
  const exportRef = useRef(null);
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

  const plain = formatInvoicePlainText(sale, invoiceProfile, {
    ...(receiptContext ?? {}),
    primaryCurrency,
    exchangeRate,
    locale,
  });

  const handlePrint = () => {
    const wrap = exportRef.current ?? previewRef.current;
    if (!wrap) return;
    const w = window.open("", "_blank", "width=420,height=720");
    if (!w) return;
    const root = wrap.innerHTML;
    w.document.write(`<!DOCTYPE html><html><head><title>${t("invoiceModal.printTitle", { number: sale.invoiceNumber ?? sale.id })}</title>
      <style>
        body { margin: 0; font-family: Georgia, serif; background: #fff; }
        .sheet {
          width: ${format.widthMm}mm;
          min-height: 0;
          margin: 0 auto;
          background: #fff;
        }
        @page {
          size: ${format.id === "LETTER" ? "Letter" : format.id === "THERMAL_80" ? "80mm auto" : "A4"};
          margin: 8mm;
        }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body><div class="sheet">${root}</div></body></html>`);
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
    const wrap = exportRef.current ?? previewRef.current;
    if (!wrap) return;
    const node = wrap.querySelector?.(".invoice-print-root") ?? wrap;
    try {
      try {
        await document.fonts?.ready;
      } catch {
        /* ignore */
      }
      const [{ default: html2canvas }, jspdfMod] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const JsPDF = jspdfMod.jsPDF ?? jspdfMod.default;
      if (typeof JsPDF !== "function") {
        throw new Error(t("invoiceModal.pdfFailed", { error: "jsPDF" }));
      }
      const canvasRaw = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const canvas = trimCanvasBottomWhitespace(canvasRaw);
      const img = canvas.toDataURL("image/png");

      // Match jsPDF page width for this print format (used to scale the raster).
      const probe = new JsPDF({
        orientation: "portrait",
        unit: "mm",
        format: format.id === "LETTER" ? "letter" : format.id === "THERMAL_80" ? [80, 297] : "a4",
      });
      const pageW = probe.internal.pageSize.getWidth();
      const maxPageH = probe.internal.pageSize.getHeight();

      const imgWidth = pageW;
      const imgHeight = (canvas.height * pageW) / canvas.width;
      const imgHMm = Math.max(imgHeight, 0.5);

      /** Each PDF page height = slice only (fixes full blank area in Acrobat). */
      const EPS = 0.25;
      let pdf = null;
      for (let yOff = 0; yOff < imgHMm - EPS; yOff += maxPageH) {
        const remaining = imgHMm - yOff;
        const sliceH = Math.min(maxPageH, remaining);
        if (pdf == null) {
          pdf = new JsPDF({
            orientation: "portrait",
            unit: "mm",
            format: [pageW, sliceH],
          });
        } else {
          pdf.addPage([pageW, sliceH], "portrait");
        }
        pdf.addImage(img, "PNG", 0, -yOff, imgWidth, imgHeight);
      }
      if (!pdf) {
        throw new Error(t("invoiceModal.captureEmpty"));
      }
      const raw = String(sale.invoiceNumber ?? sale.id ?? "invoice");
      const safe = raw.replace(/[/\\:*?"<>|]/g, "-").trim().slice(0, 120) || "invoice";
      pdf.save(`${safe}.pdf`);
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
          <div ref={previewRef} style={{ width: `${format.widthMm}mm`, minHeight: `${format.minHeightMm}mm`, margin: "0 auto" }}>
            <InvoicePrintBody
              sale={sale}
              profile={invoiceProfile}
              formatId={format.id}
              receiptContext={receiptContext}
            />
          </div>
        </Box>
      </Box>
      {createPortal(
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
              width: `${format.widthMm}mm`,
              margin: 0,
              display: "block",
              boxSizing: "border-box",
            }}
          >
            <InvoicePrintBody
              sale={sale}
              profile={invoiceProfile}
              formatId={format.id}
              receiptContext={receiptContext}
            />
          </div>
        </div>,
        document.body
      )}
    </Box>
  );
}
