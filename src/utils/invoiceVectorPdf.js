import autoTable from "jspdf-autotable";
import { resolveInvoiceProfile } from "../data/defaultInvoiceProfile";
import { getPlatformCompanyLine } from "../data/platformBranding";
import {
  DEFAULT_LOCALE,
  paymentMethodLabel,
  translate,
} from "../i18n";
import {
  RECEIPT_TYPES,
  TRANSACTION_TYPES,
} from "../domain/receiptTransaction";
import { formatDualCurrency, formatSaleChange, saleExchangeRate } from "./currency";
import { lineTotalUsd } from "./moneyRounding";
import { getInvoicePdfFormat } from "./invoiceFormats";
import { savePdfDocument } from "./savePdfDocument";
import {
  saleAppliedPromotionName,
  saleGrossSubtotalUsd,
  saleItemsSubtotalUsd,
  saleManualDiscountUsd,
  salePromotionDiscountUsd,
} from "./saleTotals";

const GRAY_HEADER = [243, 244, 246];
const GRAY_TEXT = [55, 65, 81];
const GREEN_PROMO = [5, 150, 105];
const BORDER = [209, 213, 219];

function formatAmount(amountUsd, saleRate, primaryCurrency) {
  return formatDualCurrency(amountUsd, saleRate, primaryCurrency).primary;
}

function imageFormat(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return null;
}

function addLogo(doc, dataUrl, x, y, maxHeightMm) {
  const fmt = imageFormat(dataUrl);
  if (!fmt) return 0;
  try {
    const props = doc.getImageProperties(dataUrl);
    const ratio = props.width / props.height;
    const h = maxHeightMm;
    const w = h * ratio;
    doc.addImage(dataUrl, fmt, x, y, w, h);
    return h;
  } catch {
    return 0;
  }
}

function drawLine(doc, y, margin, pageWidth) {
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
}

function writeWrapped(doc, text, x, y, maxWidth, lineHeight = 4) {
  const lines = doc.splitTextToSize(String(text ?? ""), maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function pageHeightMm(doc) {
  return doc.internal.pageSize.getHeight();
}

function footerZoneMm(isThermal) {
  return isThermal ? 8 : 14;
}

function ensureSpace(doc, y, neededHeight, margin, footerZone) {
  const pageHeight = pageHeightMm(doc);
  if (y + neededHeight > pageHeight - footerZone) {
    doc.addPage();
    return margin;
  }
  return y;
}

function addPageNumbers(doc, { isThermal, smallSize, t }) {
  const totalPages = doc.internal.getNumberOfPages();
  if (totalPages <= 1) return;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = pageHeightMm(doc);
  const y = pageHeight - (isThermal ? 3 : 5);

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(smallSize);
    doc.setTextColor(...GRAY_TEXT);
    doc.text(t("receipt.pageOf", { page, total: totalPages }), pageWidth / 2, y, {
      align: "center",
    });
  }
  doc.setTextColor(0, 0, 0);
}

function receiptBannerLabel(receiptType, transactionType, copyIndex, t) {
  if (receiptType === RECEIPT_TYPES.NORMAL && transactionType === TRANSACTION_TYPES.SALES) {
    return null;
  }
  let label = receiptType;
  if (receiptType === RECEIPT_TYPES.COPY) {
    label = t("receipt.copyBannerLabel", { n: copyIndex ?? 1 });
  }
  if (receiptType === RECEIPT_TYPES.TRAINING) label = t("receipt.trainingNoFiscal");
  if (receiptType === RECEIPT_TYPES.PROFORMA) label = t("receipt.proformaNotTax");
  if (transactionType === TRANSACTION_TYPES.REFUND) label = `${label}${t("receipt.refundSuffix")}`;
  return label;
}

/**
 * Build a vector PDF document (no download). Use with savePdfDocument or email export.
 */
export async function buildInvoiceVectorPdfDoc({
  sale,
  profile,
  receiptContext = {},
  promotions = [],
  primaryCurrency,
  exchangeRate,
  locale = DEFAULT_LOCALE,
  formatId = "A4",
  filename = "invoice",
}) {
  const { jsPDF } = await import("jspdf");
  const t = (key, params) => translate(key, locale, params);
  const p = resolveInvoiceProfile(profile, locale);
  const saleRate = saleExchangeRate(sale, exchangeRate);
  const isThermal = formatId === "THERMAL_80";
  const pdfFormat = getInvoicePdfFormat(formatId);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: pdfFormat,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = isThermal ? 4 : 12;
  const footerZone = footerZoneMm(isThermal);
  const contentWidth = pageWidth - margin * 2;
  const bodySize = isThermal ? 7 : 9;
  const smallSize = isThermal ? 6 : 8;
  const titleSize = isThermal ? 10 : 14;
  const companySize = isThermal ? 11 : 16;
  let y = margin;

  const receiptType = receiptContext?.receiptType ?? sale.receiptType ?? RECEIPT_TYPES.NORMAL;
  const transactionType =
    receiptContext?.transactionType ??
    sale.transactionType ??
    (sale.status === "refunded" ? TRANSACTION_TYPES.REFUND : TRANSACTION_TYPES.SALES);
  const refunded = sale.status === "refunded" || transactionType === TRANSACTION_TYPES.REFUND;
  const sdcCode = receiptContext?.sdcReceiptCode ?? sale.sdcReceiptCode;
  const copyIndex = receiptContext?.copyIndex ?? sale.copyIndex;

  const banner = receiptBannerLabel(receiptType, transactionType, copyIndex, t);
  if (banner) {
    doc.setFillColor(254, 243, 199);
    doc.rect(margin, y, contentWidth, isThermal ? 8 : 10, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(smallSize);
    doc.setTextColor(146, 64, 14);
    doc.text(banner, pageWidth / 2, y + (isThermal ? 5 : 6), { align: "center" });
    if (sdcCode) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(smallSize - 1);
      doc.text(sdcCode, pageWidth / 2, y + (isThermal ? 7 : 9), { align: "center" });
    }
    y += isThermal ? 10 : 12;
    doc.setTextColor(0, 0, 0);
  }

  const logoMaxH = isThermal ? 10 : 16;
  const logoH = addLogo(doc, p.companyLogo, margin, y, logoMaxH);

  const contactLines = [
    p.addressLine1,
    p.addressLine2,
    p.cityProvince,
    p.phone ? t("receipt.tel", { phone: p.phone }) : "",
    p.email,
    p.taxId ? t("receipt.taxId", { id: p.taxId }) : "",
  ].filter(Boolean);

  if (contactLines.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(smallSize);
    doc.setTextColor(...GRAY_TEXT);
    let contactY = y + 2;
    for (const line of contactLines) {
      doc.text(line, pageWidth / 2, contactY, { align: "center" });
      contactY += isThermal ? 3 : 3.5;
    }
    doc.setTextColor(0, 0, 0);
  }

  y = Math.max(y + logoH, y + (contactLines.length > 0 ? contactLines.length * 3.5 + 2 : 0)) + 2;
  drawLine(doc, y, margin, pageWidth);
  y += isThermal ? 4 : 6;

  const companyName = String(p.companyName ?? "").trim();
  if (companyName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(companySize);
    doc.text(companyName, margin, y);
    y += isThermal ? 5 : 7;
  }
  if (p.companyTagline) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(smallSize);
    doc.setTextColor(...GRAY_TEXT);
    doc.text(p.companyTagline, margin, y);
    doc.setTextColor(0, 0, 0);
    y += isThermal ? 4 : 5;
  }

  y += 2;
  const metaTop = y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(bodySize);
  doc.text(p.invoiceTitle || t("receipt.salesInvoice"), margin, y);
  if (p.invoiceSubtitle) {
    y += isThermal ? 3.5 : 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(smallSize);
    doc.setTextColor(...GRAY_TEXT);
    doc.text(p.invoiceSubtitle, margin, y);
    doc.setTextColor(0, 0, 0);
  }

  const invoiceLabel = t("receipt.invoiceLabel", { number: sale.invoiceNumber ?? sale.id });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(titleSize);
  doc.text(invoiceLabel, pageWidth - margin, metaTop, { align: "right" });

  y += isThermal ? 6 : 8;
  const colMid = pageWidth / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(smallSize);
  doc.setTextColor(...GRAY_TEXT);
  doc.text(t("receipt.billTo"), margin, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(bodySize);
  y += isThermal ? 3.5 : 4;
  doc.text(sale.customerName ?? t("payment.walkIn"), margin, y);
  if (sale.customerPhone) {
    y += isThermal ? 3.5 : 4;
    doc.text(sale.customerPhone, margin, y);
  }
  if (sale.customerTaxNumber) {
    y += isThermal ? 3.5 : 4;
    doc.text(`${t("payment.taxNumber")}: ${sale.customerTaxNumber}`, margin, y);
  }
  if (sale.customerAddress) {
    y = writeWrapped(doc, sale.customerAddress, margin, y + (isThermal ? 3.5 : 4), colMid - margin - 4, isThermal ? 3 : 4);
  }
  if (sale.customerEmail) {
    y += isThermal ? 3.5 : 4;
    doc.text(sale.customerEmail, margin, y);
  }

  const paymentLabel =
    receiptType === RECEIPT_TYPES.PROFORMA
      ? t("receipt.proformaPayment")
      : sale.methodLabel ?? paymentMethodLabel(sale.method, locale) ?? "—";

  let metaY = metaTop + (isThermal ? 6 : 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(bodySize);
  const metaLines = [
    t("receipt.issueDate", { date: new Date(sale.timestamp).toLocaleDateString() }),
    t("receipt.refShort", { ref: sale.invoiceNumber ?? sale.id }),
    `${t("receipt.payment")}: ${paymentLabel}`,
    sdcCode ? `SDC: ${sdcCode}` : null,
  ].filter(Boolean);

  for (const line of metaLines) {
    doc.text(line, pageWidth - margin, metaY, { align: "right" });
    metaY += isThermal ? 3.5 : 4;
  }

  y = Math.max(y, metaY) + (isThermal ? 4 : 6);

  if (refunded) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(smallSize);
    doc.setTextColor(185, 28, 28);
    let refundText = t("receipt.refundedAt", {
      date: new Date(sale.refund?.at ?? sale.timestamp).toLocaleString(),
    });
    if (sale.refund?.reason) refundText += ` (${sale.refund.reason})`;
    y = writeWrapped(doc, refundText, margin, y, contentWidth, isThermal ? 3 : 4) + 2;
    doc.setTextColor(0, 0, 0);
  }

  const tableBody = (sale.items ?? []).map((it) => {
    const desc = it.lotNumber ? `${it.name}\n${t("pos.lot")} ${it.lotNumber}` : it.name;
    return [
      desc,
      String(it.qty),
      formatAmount(it.price, saleRate, primaryCurrency),
      formatAmount(lineTotalUsd(it.price, it.qty), saleRate, primaryCurrency),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, top: margin, bottom: footerZone },
    head: [[t("receipt.description"), t("common.qty"), t("receipt.unitPriceShort"), t("receipt.amount")]],
    body: tableBody,
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "auto",
    styles: {
      font: "helvetica",
      fontSize: bodySize,
      cellPadding: isThermal ? 1.2 : 2,
      lineColor: BORDER,
      lineWidth: 0.1,
      textColor: [17, 24, 39],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: GRAY_HEADER,
      textColor: GRAY_TEXT,
      fontStyle: "bold",
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: isThermal ? 28 : "auto" },
      1: { halign: "right", cellWidth: isThermal ? 8 : 18 },
      2: { halign: "right", cellWidth: isThermal ? 16 : 28 },
      3: { halign: "right", cellWidth: isThermal ? 18 : 30 },
    },
  });

  y = doc.lastAutoTable.finalY + (isThermal ? 4 : 6);

  const manualDiscountUSD = saleManualDiscountUsd(sale);
  const subtotalUSD = manualDiscountUSD > 0.001 ? saleGrossSubtotalUsd(sale) : saleItemsSubtotalUsd(sale);
  const promotionDiscountUSD = salePromotionDiscountUsd(sale);
  const totalUSD = Number(sale.totalUSD) || 0;
  const promotionName = saleAppliedPromotionName(sale, promotions);

  const lineStep = isThermal ? 4 : 5;
  const extraLines =
    (manualDiscountUSD > 0.001 ? 1 : 0) + (promotionDiscountUSD > 0.001 ? 1 : 0);
  const totalsHeight = lineStep * (1 + extraLines + 1) + (isThermal ? 10 : 12);
  y = ensureSpace(doc, y, totalsHeight, margin, footerZone);
  const totalsX = pageWidth - margin;
  const labelX = totalsX - (isThermal ? 38 : 55);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(bodySize);

  const drawTotalLine = (label, value, { bold = false, color = null } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    if (color) doc.setTextColor(...color);
    doc.text(label, labelX, y, { align: "right" });
    doc.text(value, totalsX, y, { align: "right" });
    if (color) doc.setTextColor(0, 0, 0);
    y += isThermal ? 4 : 5;
  };

  drawTotalLine(t("receipt.subtotal"), formatAmount(subtotalUSD, saleRate, primaryCurrency));
  if (manualDiscountUSD > 0.001) {
    drawTotalLine(t("receipt.manualDiscount"), `-${formatAmount(manualDiscountUSD, saleRate, primaryCurrency)}`, {
      color: GREEN_PROMO,
    });
  }
  if (promotionDiscountUSD > 0.001) {
    const promoLabel = promotionName
      ? t("receipt.promotionApplied", { name: promotionName })
      : t("receipt.promotionDiscount");
    drawTotalLine(promoLabel, `-${formatAmount(promotionDiscountUSD, saleRate, primaryCurrency)}`, {
      color: GREEN_PROMO,
    });
  }
  y += 1;
  drawLine(doc, y, labelX - 2, totalsX);
  y += isThermal ? 4 : 5;
  drawTotalLine(t("common.total"), formatAmount(totalUSD, saleRate, primaryCurrency), { bold: true });

  const change = formatSaleChange(sale, saleRate, primaryCurrency);
  if (change.changePrimary > 0) {
    drawTotalLine(t("receipt.changePrimary", { currency: primaryCurrency }), change.primary);
  }

  y += isThermal ? 4 : 6;
  const footerLines =
    (p.footerTitle ? 1 : 0) +
    (p.footerBody ? Math.ceil(String(p.footerBody).length / 60) : 0) +
    2;
  const footerHeight = footerLines * (isThermal ? 3.5 : 4) + 4;
  y = ensureSpace(doc, y, footerHeight, margin, footerZone);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(smallSize);
  doc.setTextColor(...GRAY_TEXT);
  if (p.footerTitle) {
    doc.setFont("helvetica", "bold");
    doc.text(p.footerTitle, margin, y);
    y += isThermal ? 3.5 : 4;
    doc.setFont("helvetica", "normal");
  }
  if (p.footerBody) {
    y = writeWrapped(doc, p.footerBody, margin, y, contentWidth, isThermal ? 3 : 4);
  }
  y += 1;
  doc.text(t("receipt.issuedBy", { name: sale.cashierName ?? t("receipt.staffDefault") }), margin, y);
  y += isThermal ? 3.5 : 4;
  doc.setFont("helvetica", "bold");
  doc.text(getPlatformCompanyLine(locale), margin, y);

  addPageNumbers(doc, { isThermal, smallSize, t });

  return doc;
}

/** Vector PDF with selectable text — prompts save location in Tauri. */
export async function saveInvoiceVectorPdf(args) {
  const doc = await buildInvoiceVectorPdfDoc(args);
  const { filename, dialogTitle } = args;
  return savePdfDocument(doc, filename ?? "invoice", { dialogTitle });
}
