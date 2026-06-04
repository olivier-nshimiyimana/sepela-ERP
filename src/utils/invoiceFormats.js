export const INVOICE_FORMATS = [
  { id: "A4", label: "A4 (210 x 297 mm)", widthMm: 210, minHeightMm: 297 },
  { id: "LETTER", label: "Letter (8.5 x 11 in)", widthMm: 216, minHeightMm: 279 },
  { id: "THERMAL_80", label: "Thermal 80mm", widthMm: 80, minHeightMm: 180 },
];

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

