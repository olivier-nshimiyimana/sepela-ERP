import { DEFAULT_LOCALE, translate } from "../i18n";

export const INVOICE_FORMATS = [
  { id: "A4", labelKey: "settings.formatA4", widthMm: 210, minHeightMm: 297 },
  { id: "LETTER", labelKey: "settings.formatLetter", widthMm: 216, minHeightMm: 279 },
  { id: "THERMAL_80", labelKey: "settings.formatThermal80", widthMm: 80, minHeightMm: 180 },
];

export function getInvoiceFormatLabel(formatId, locale = DEFAULT_LOCALE) {
  const format = INVOICE_FORMATS.find((f) => f.id === formatId) ?? INVOICE_FORMATS[0];
  return translate(format.labelKey, locale);
}

export function getInvoiceFormat(formatId) {
  return INVOICE_FORMATS.find((f) => f.id === formatId) ?? INVOICE_FORMATS[0];
}

export function getInvoicePageCssSize(formatId) {
  const format = getInvoiceFormat(formatId);
  if (format.id === "LETTER") return "Letter";
  if (format.id === "THERMAL_80") return "80mm auto";
  return "A4";
}

export function getInvoicePdfFormat(formatId) {
  const format = getInvoiceFormat(formatId);
  if (format.id === "LETTER") return "letter";
  if (format.id === "THERMAL_80") return [format.widthMm, format.minHeightMm];
  return "a4";
}

