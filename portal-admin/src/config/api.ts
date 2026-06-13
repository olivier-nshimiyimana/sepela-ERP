export function resolveApiBaseUrl() {
  const fromEnv = String(import.meta.env.VITE_PORTAL_API_BASE_URL ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "http://localhost:4000";
}
