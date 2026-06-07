import en from "./locales/en";
import fr from "./locales/fr";

export const LOCALES = {
  FR: "fr",
  EN: "en",
};

export const DEFAULT_LOCALE = LOCALES.FR;

export const LOCALE_OPTIONS = [
  { value: LOCALES.FR, labelKey: "language.french" },
  { value: LOCALES.EN, labelKey: "language.english" },
];

const catalogs = {
  [LOCALES.FR]: fr,
  [LOCALES.EN]: en,
};

export function normalizeLocale(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "en" || raw === "english" || raw === "anglais") return LOCALES.EN;
  return LOCALES.FR;
}

function resolvePath(catalog, key) {
  return key.split(".").reduce((node, part) => node?.[part], catalog);
}

export function periodLabel(period, locale = DEFAULT_LOCALE) {
  const map = {
    daily: "reports.periodDaily",
    weekly: "reports.periodWeekly",
    monthly: "reports.periodMonthly",
  };
  return translate(map[period] ?? "reports.periodDaily", locale);
}

export function paymentMethodLabel(methodId, locale = DEFAULT_LOCALE) {
  const map = {
    cash: "payment.cash",
    mobile_money: "payment.mobile",
    card: "payment.card",
  };
  return translate(map[methodId] ?? "payment.cash", locale);
}

export function receiptTypeLabel(receiptType, locale = DEFAULT_LOCALE) {
  const map = {
    NORMAL: "receipt.receiptTypeNormal",
    COPY: "receipt.receiptTypeCopy",
    TRAINING: "receipt.receiptTypeTraining",
    PROFORMA: "receipt.receiptTypeProforma",
  };
  return translate(map[receiptType] ?? receiptType, locale);
}

export function transactionTypeLabel(transactionType, locale = DEFAULT_LOCALE) {
  const map = {
    SALES: "receipt.transactionSales",
    REFUND: "receipt.transactionRefund",
  };
  return translate(map[transactionType] ?? transactionType, locale);
}

export function translate(key, locale = DEFAULT_LOCALE, params = {}) {
  const catalog = catalogs[normalizeLocale(locale)] ?? catalogs[DEFAULT_LOCALE];
  let text = resolvePath(catalog, key);
  if (typeof text !== "string") {
    text = resolvePath(catalogs[LOCALES.EN], key);
  }
  if (typeof text !== "string") return key;
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    params[name] !== undefined && params[name] !== null ? String(params[name]) : ""
  );
}

export function appError(key, locale = DEFAULT_LOCALE, params = {}) {
  if (key.startsWith("login.")) {
    return translate(key, locale, params);
  }
  return translate(`errors.${key}`, locale, params);
}

const ERROR_STRING_MAP = {
  "Client name is required.": "clientNameRequired",
  "Client phone number is required.": "clientPhoneRequired",
  "Client tax number is required.": "clientTaxRequired",
  "Enter a valid client email address.": "clientEmailInvalid",
  "Client not found.": "clientNotFound",
  "Product name is required.": "productNameRequired",
  "Lot number is required (min 2 characters).": "lotRequired",
  "Enter a valid expiration date.": "expirationInvalid",
  "Enter a valid price.": "priceInvalid",
  "Enter a valid stock quantity (single items).": "stockInvalid",
  "Qty per unit must be at least 1.": "qtyPerUnitInvalid",
  "Enter a valid buy unit cost.": "buyCostInvalid",
  "Enter a valid reorder level (items).": "reorderInvalid",
  "Supplier name is required.": "supplierNameRequired",
  "Add at least one purchase item.": "purchaseItemsRequired",
  "Select a CSV file with at least one product row.": "csvNoRows",
  "Enter a valid exchange rate.": "exchangeRateInvalid",
  "Alert window must be between 1 and 365 days.": "expiryWindowInvalid",
  "No file selected.": "logoNoFile",
  "Use a PNG, JPEG, or WebP image.": "logoBadType",
  "Image must be 2 MB or smaller.": "logoTooLarge",
  "Could not read that image.": "logoReadFailed",
  "Quantity must be at least 1.": "qtyMinOne",
  "Enter a positive quantity to add.": "restockQtyPositive",
  "Lot number must be at least 2 characters.": "restockLotMin",
  "Product batch not found.": "productBatchNotFound",
  "Invoice not found.": "invoiceNotFound",
  "This invoice was already refunded.": "invoiceAlreadyRefunded",
  "Unknown error.": "unknownError",
  "Merchant code is required.": "merchantCodeRequired",
  "Set the cloud API URL first.": "cloudApiUrlRequired",
  "Enter the cloud API URL before enabling sync.": "cloudApiUrlBeforeSync",
  "Set the cloud API bearer token first.": "cloudTokenRequired",
  "Set the cloud API URL and bearer token first.": "cloudUrlAndToken",
  "Enter the merchant code from the portal.": "cloudMerchantCode",
  "Enter the branch code from the portal.": "cloudBranchCode",
  "Enter the device code from the portal.": "cloudDeviceCode",
  "Enter the activation code from the portal.": "cloudActivationCode",
  "Enter a device label for this desktop.": "cloudDeviceLabel",
  "Enter the portal API URL.": "portalApiUrl",
  "Enter the portal API token.": "portalApiToken",
  "Cloud activation is no longer valid.": "cloudActivationInvalid",
  "Add items to the cart before saving a draft.": "draftCartEmpty",
  "Draft not found.": "draftNotFound",
  "Backup file is not valid JSON data.": "backupInvalidJson",
  "This backup file does not belong to Sepela ERP.": "backupNotSepela",
  "Backup data section is missing.": "backupDataMissing",
  "Enter username and password (min 6 characters).": "loginCredentials",
  "Invalid username or password.": "loginInvalid",
  "Username required; password min 6 characters.": "userUsernamePassword",
  "Invalid role.": "userInvalidRole",
  "Username already exists.": "userExists",
  "You cannot deactivate your own account.": "userSelfDeactivate",
  "Backup must contain at least one user account.": "userBackupRequired",
  "Operator accounts are managed in the cloud portal.": "operatorsPortalOnly",
  "Cannot reach the portal and no matching cached account was found. Sign in once while online, then you can work offline.":
    "login.offlineNoCache",
  "Signed in offline using cached credentials.": "login.signedInOffline",
  "Signed in and synced with the portal.": "login.signedInOnline",
  "Portal unreachable — signed in offline with cached credentials.": "login.portalUnreachableOffline",
  "Cloud sign-in failed.": "login.cloudSignInFailed",
  "Terminal API token is invalid. Check VITE_PORTAL_API_TOKEN in .env matches portal-api PORTAL_BEARER_TOKEN, then restart the app.":
    "login.invalidApiToken",
  "Invalid username or password. If this account was edited in portal-admin, use the latest password.":
    "login.invalidCredentialsPortal",
  "Your store is not activated or your license has expired. Please contact SEPELA INC for assistance.":
    "login.activationSupport",
  "This terminal is not configured for cloud access. Please contact SEPELA INC.":
    "login.terminalNotConfigured",
};

const PURCHASE_LINE_PATTERNS = [
  [/^Line (\d+): choose a valid product\.$/, "purchaseLineProduct"],
  [/^Line (\d+): quantity must be greater than zero\.$/, "purchaseLineQty"],
  [/^Line (\d+): unit cost must be zero or more\.$/, "purchaseLineCost"],
  [/^Line (\d+): lot number is required\.$/, "purchaseLineLot"],
  [/^Line (\d+): expiration date is required\.$/, "purchaseLineExpiry"],
];

export function translateUserError(error, locale = DEFAULT_LOCALE) {
  if (!error) return "";
  const text = String(error).trim();
  if (!text) return "";

  const key = ERROR_STRING_MAP[text];
  if (key) return appError(key, locale);

  const noStockMatch = text.match(/^No sellable stock available for (.+)\.$/);
  if (noStockMatch) {
    return appError("noSellableStock", locale, { name: noStockMatch[1] });
  }

  const onlyStockMatch = text.match(/^Only (\d+) in stock for (.+)\.$/);
  if (onlyStockMatch) {
    return appError("onlyInStock", locale, { count: onlyStockMatch[1], name: onlyStockMatch[2] });
  }

  const leaseMatch = text.match(
    /^This device lease is for "(.+)" but you are signed in as "(.+)"\. Activate the device for the current merchant in Settings\.$/
  );
  if (leaseMatch) {
    return appError("cloudLeaseMismatch", locale, { lease: leaseMatch[1], current: leaseMatch[2] });
  }

  const csvHeaderMatch = text.match(/^CSV header must be exactly: (.+)$/);
  if (csvHeaderMatch) {
    return appError("csvHeader", locale, { header: csvHeaderMatch[1] });
  }

  const csvHeaderRowMatch = text.match(
    /^CSV must include a header and at least one product row\. Expected columns: (.+)$/
  );
  if (csvHeaderRowMatch) {
    return appError("csvHeaderAndRow", locale, { header: csvHeaderRowMatch[1] });
  }

  for (const [pattern, errorKey] of PURCHASE_LINE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return appError(errorKey, locale, { line: match[1] });
  }

  const rowMatch = text.match(/^Row (\d+): (.+)$/);
  if (rowMatch) {
    return appError("csvRow", locale, {
      row: rowMatch[1],
      message: translateUserError(rowMatch[2], locale),
    });
  }

  return text;
}
