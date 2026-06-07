import { DEFAULT_INVOICE_PROFILE, resolveInvoiceProfile } from "../data/defaultInvoiceProfile";
import { DEFAULT_PRIMARY_CURRENCY, normalizePrimaryCurrency } from "./currency";
import { DEFAULT_EXPIRY_ALERT_DAYS } from "./productExpiry";
import { DEFAULT_LOCALE, normalizeLocale } from "../i18n";

export function normalizeMerchantCode(merchantCode) {
  const code = String(merchantCode ?? "").trim();
  return code || "local";
}

/** Stored JSON shape (global + per-merchant invoice fields). */
export function migrateStoredAppSettings(raw, activeMerchantCode = "local") {
  const parsed =
    raw && typeof raw === "object"
      ? { ...raw }
      : typeof raw === "string"
        ? (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return {};
            }
          })()
        : {};

  if (parsed.invoiceProfiles && typeof parsed.invoiceProfiles === "object") {
    return parsed;
  }

  const code = normalizeMerchantCode(activeMerchantCode);
  const next = { ...parsed, invoiceProfiles: {}, invoiceCounters: {} };

  if (parsed.invoiceProfile && typeof parsed.invoiceProfile === "object") {
    next.invoiceProfiles[code] = parsed.invoiceProfile;
    next.invoiceCounters[code] = Math.max(1, parseInt(parsed.invoiceCounter, 10) || 1);
  }

  delete next.invoiceProfile;
  delete next.invoiceCounter;
  return next;
}

export function resolveAppSettingsForMerchant(raw, merchantCode) {
  const stored = migrateStoredAppSettings(raw, merchantCode);
  const code = normalizeMerchantCode(merchantCode);
  const profiles = stored.invoiceProfiles ?? {};
  const counters = stored.invoiceCounters ?? {};

  return {
    exchangeRate: Number(stored.exchangeRate) > 0 ? Number(stored.exchangeRate) : 2850,
    primaryCurrency: normalizePrimaryCurrency(stored.primaryCurrency),
    language: normalizeLocale(stored.language ?? DEFAULT_LOCALE),
    expiryAlertDays:
      Number(stored.expiryAlertDays) > 0
        ? Number(stored.expiryAlertDays)
        : DEFAULT_EXPIRY_ALERT_DAYS,
    invoiceProfile: resolveInvoiceProfile(
      { ...DEFAULT_INVOICE_PROFILE, ...(profiles[code] ?? {}) },
      normalizeLocale(stored.language ?? DEFAULT_LOCALE)
    ),
    invoiceCounter: Math.max(1, parseInt(counters[code], 10) || 1),
    trainingMode: !!stored.trainingMode,
    legalAcceptance:
      stored.legalAcceptance?.version && stored.legalAcceptance?.acceptedAt
        ? stored.legalAcceptance
        : null,
    invoiceProfiles: profiles,
    invoiceCounters: counters,
  };
}

/**
 * Merge a settings patch into stored settings for one merchant.
 * `patch` may include merchant-scoped `invoiceProfile` / `invoiceCounter` plus global fields.
 */
export function mergeAppSettingsForMerchant(raw, merchantCode, patch) {
  const code = normalizeMerchantCode(merchantCode);
  const stored = migrateStoredAppSettings(raw, code);
  const next = { ...stored };

  const {
    invoiceProfile,
    invoiceCounter,
    invoiceProfiles: _profiles,
    invoiceCounters: _counters,
    ...global
  } = patch ?? {};

  Object.assign(next, global);

  if (invoiceProfile !== undefined) {
    next.invoiceProfiles = {
      ...(next.invoiceProfiles ?? {}),
      [code]: invoiceProfile,
    };
  }
  if (invoiceCounter !== undefined) {
    next.invoiceCounters = {
      ...(next.invoiceCounters ?? {}),
      [code]: Math.max(1, parseInt(invoiceCounter, 10) || 1),
    };
  }

  delete next.invoiceProfile;
  delete next.invoiceCounter;
  return next;
}

export function settingsForBackupExport(raw) {
  return migrateStoredAppSettings(raw);
}

export function settingsFromBackupImport(data, activeMerchantCode) {
  const incoming = data && typeof data === "object" ? { ...data } : {};
  if (incoming.invoiceProfiles) {
    return migrateStoredAppSettings(incoming, activeMerchantCode);
  }
  const code = normalizeMerchantCode(activeMerchantCode);
  return mergeAppSettingsForMerchant({}, code, {
    exchangeRate: incoming.exchangeRate ?? 2850,
    primaryCurrency: incoming.primaryCurrency ?? DEFAULT_PRIMARY_CURRENCY,
    language: normalizeLocale(incoming.language ?? DEFAULT_LOCALE),
    expiryAlertDays: incoming.expiryAlertDays ?? DEFAULT_EXPIRY_ALERT_DAYS,
    trainingMode: !!incoming.trainingMode,
    legalAcceptance: incoming.legalAcceptance ?? null,
    invoiceProfile: { ...DEFAULT_INVOICE_PROFILE, ...(incoming.invoiceProfile ?? {}) },
    invoiceCounter: Math.max(1, parseInt(incoming.invoiceCounter, 10) || 1),
  });
}
