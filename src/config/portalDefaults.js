/** Hosted portal API (Render). Override with VITE_PORTAL_API_URL for local dev. */
export const PRODUCTION_PORTAL_API_URL = "https://sepela-erp-api.onrender.com";

/** Portal admin UI (merchants, devices, operators). */
export const PRODUCTION_PORTAL_ADMIN_URL = "https://sepela-erp-portal-admin.onrender.com";

export const DEFAULT_PORTAL_API_URL =
  String(import.meta.env.VITE_PORTAL_API_URL ?? "").trim() || PRODUCTION_PORTAL_API_URL;

export const DEFAULT_PORTAL_API_TOKEN = String(import.meta.env.VITE_PORTAL_API_TOKEN ?? "").trim();

export const ACTIVATION_SUPPORT_MESSAGE =
  "Your store is not activated or your license has expired. Please contact SEPELA INC for assistance.";

export const TERMINAL_NOT_CONFIGURED_MESSAGE =
  "This terminal is not configured for cloud access. Please contact SEPELA INC.";

export function normalizePortalApiBaseUrl(url) {
  return String(url ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
}

export function resolvePortalConnection(cloudSync = {}) {
  const apiBaseUrl =
    normalizePortalApiBaseUrl(cloudSync.apiBaseUrl) || normalizePortalApiBaseUrl(DEFAULT_PORTAL_API_URL);
  const apiToken = String(cloudSync.apiToken ?? "").trim() || DEFAULT_PORTAL_API_TOKEN;
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
