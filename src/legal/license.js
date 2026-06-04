import eulaText from "../../legal/EULA.txt?raw";

export const EULA_VERSION = "1.0.0";
export { eulaText };

const STORAGE_KEY = "sepela_erp_eula_accepted";

export function readLocalLicenseAcceptance() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version === EULA_VERSION && parsed?.acceptedAt) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function saveLocalLicenseAcceptance() {
  const record = { version: EULA_VERSION, acceptedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  return record;
}

export function isLicenseAcceptedInSettings(settings) {
  const legal = settings?.legalAcceptance;
  return legal?.version === EULA_VERSION && !!legal?.acceptedAt;
}

export function licenseAcceptanceForSettings() {
  return { version: EULA_VERSION, acceptedAt: new Date().toISOString() };
}
