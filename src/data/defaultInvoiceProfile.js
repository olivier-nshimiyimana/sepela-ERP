import { DEFAULT_LOCALE, translate } from "../i18n";

/** Legacy English defaults stored before i18n (still resolved to the active locale). */
const LEGACY_INVOICE_TITLES = new Set(["SALES INVOICE", "INVOICE"]);

const LEGACY_EN_DEFAULTS = {
  footerTitle: "Thank you for your business",
  footerBody:
    "This invoice was issued electronically. Retain for your records.\nFor questions, contact the store during business hours.",
  cityProvince: "DRC",
};

const TRANSLATABLE_FIELDS = [
  ["invoiceTitle", "invoiceDefaults.invoiceTitle"],
  ["footerTitle", "invoiceDefaults.footerTitle"],
  ["footerBody", "invoiceDefaults.footerBody"],
  ["cityProvince", "invoiceDefaults.cityProvince"],
];

/** Default invoice & company block — merchants fill in their own details. */
export const DEFAULT_INVOICE_PROFILE = {
  companyLogo: "",
  companyName: "",
  companyTagline: "",
  addressLine1: "",
  addressLine2: "",
  cityProvince: "",
  taxId: "",
  phone: "",
  email: "",
  invoiceTitle: "",
  invoiceSubtitle: "",
  footerTitle: "",
  footerBody: "",
  invoicePrefix: "SEP",
  defaultPrintFormat: "A4",
};

function isUnsetOrLegacy(field, value) {
  const text = String(value ?? "").trim();
  if (!text) return true;
  if (field === "invoiceTitle") return LEGACY_INVOICE_TITLES.has(text);
  const legacy = LEGACY_EN_DEFAULTS[field];
  return legacy != null && text === legacy;
}

/** Apply locale defaults for empty or legacy English template fields. */
export function resolveInvoiceProfile(profile = {}, locale = DEFAULT_LOCALE) {
  const merged = { ...DEFAULT_INVOICE_PROFILE, ...profile };
  for (const [field, key] of TRANSLATABLE_FIELDS) {
    if (isUnsetOrLegacy(field, merged[field])) {
      merged[field] = translate(key, locale);
    }
  }
  return merged;
}

export function getDefaultInvoiceProfile(locale = DEFAULT_LOCALE) {
  return resolveInvoiceProfile(DEFAULT_INVOICE_PROFILE, locale);
}
