/** Hosted portal API (Render). Override with VITE_PORTAL_API_URL for local dev. */
export const PRODUCTION_PORTAL_API_URL = "https://sepela-erp-api.onrender.com";

/** Portal admin UI (merchants, devices, operators). */
export const PRODUCTION_PORTAL_ADMIN_URL = "https://sepela-erp-portal-admin.onrender.com";

function isBrowserDev() {
  try {
    return import.meta.env.DEV && globalThis.isTauri !== true;
  } catch {
    return false;
  }
}

function envPortalApiUrl() {
  return String(import.meta.env.VITE_PORTAL_API_URL ?? "").trim();
}

function isLocalDevApiUrl(url) {
  const normalized = normalizePortalApiBaseUrl(url);
  if (!normalized) return false;
  if (normalized === "/portal-api") return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized);
}

/** In browser dev, use Vite proxy (`/portal-api`) to avoid CORS. Tauri uses the real URL. */
export const DEFAULT_PORTAL_API_URL = (() => {
  const fromEnv = envPortalApiUrl();
  if (isBrowserDev()) {
    if (fromEnv && isLocalDevApiUrl(fromEnv)) return "/portal-api";
    if (!fromEnv || fromEnv === PRODUCTION_PORTAL_API_URL) return "/portal-api";
  }
  return fromEnv || PRODUCTION_PORTAL_API_URL;
})();

export const DEFAULT_PORTAL_API_TOKEN = String(import.meta.env.VITE_PORTAL_API_TOKEN ?? "").trim();

export const ACTIVATION_SUPPORT_MESSAGE =
  "Your store is not activated or your license has expired. Please contact SEPELA INC for assistance.";

export const TERMINAL_NOT_CONFIGURED_MESSAGE =
  "This terminal is not configured for cloud access. Please contact SEPELA INC.";

export const DEVICE_MERCHANT_MISMATCH_MESSAGE =
  "This terminal is activated for another store. Sign in with that store's account, or re-activate the device in Settings for your store.";

export function normalizePortalApiBaseUrl(url) {
  return String(url ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
}

function portalApiUrlForRuntime(url) {
  const normalized = normalizePortalApiBaseUrl(url);
  if (isBrowserDev() && normalized === PRODUCTION_PORTAL_API_URL) {
    return "/portal-api";
  }
  return normalized;
}

function resolveApiToken(cloudSync = {}) {
  const fromSync = String(cloudSync.apiToken ?? "").trim();
  const fromEnv = DEFAULT_PORTAL_API_TOKEN;
  // Dev: .env token wins so stale SQLite/localStorage tokens do not cause 401.
  if (import.meta.env.DEV && fromEnv) return fromEnv;
  return fromSync || fromEnv;
}

function resolveApiBaseUrl(cloudSync = {}) {
  const fromEnv = envPortalApiUrl();
  // Dev: localhost in .env overrides production URL saved in cloud-sync settings.
  if (import.meta.env.DEV && fromEnv && isLocalDevApiUrl(fromEnv)) {
    return isBrowserDev() ? "/portal-api" : normalizePortalApiBaseUrl(fromEnv);
  }
  return (
    portalApiUrlForRuntime(cloudSync.apiBaseUrl) || portalApiUrlForRuntime(DEFAULT_PORTAL_API_URL)
  );
}

export function resolvePortalConnection(cloudSync = {}) {
  const apiBaseUrl = resolveApiBaseUrl(cloudSync);
  const apiToken = resolveApiToken(cloudSync);
  return { apiBaseUrl, apiToken, configured: !!(apiBaseUrl && apiToken) };
}

export function deviceBindingToCloudFields(binding) {
  if (!binding?.allowed) return null;
  return {
    enabled: true,
    merchantCode: binding.merchant?.code ?? "",
    branchCode: binding.branch?.code ?? "",
    deviceCode: binding.device?.deviceCode ?? "",
    deviceLabel: binding.device?.label ?? "",
    activationCode: binding.activationCode?.code ?? "",
    leaseStatus: binding.lease?.status ?? "",
    leaseToken: binding.lease?.leaseToken ?? "",
    leaseValidFrom: binding.lease?.validFrom ?? null,
    leaseValidUntil: binding.lease?.validUntil ?? null,
    leaseIssuedAt: binding.lease?.issuedAt ?? null,
  };
}
