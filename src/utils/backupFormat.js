export const BACKUP_FORMAT_VERSION = 1;

export function buildAppBackup({ users = [], data = {} } = {}) {
  return {
    app: "sepela-erp-system",
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      products: data.products ?? [],
      customers: data.customers ?? [],
      suppliers: data.suppliers ?? [],
      sales: data.sales ?? [],
      purchases: data.purchases ?? [],
      stockSnapshots: data.stockSnapshots ?? [],
      settings: data.settings ?? {},
      users,
    },
  };
}

export function validateAppBackup(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Backup file is not valid JSON data." };
  }

  if (payload.app !== "sepela-erp-system") {
    return { ok: false, error: "This backup file does not belong to Sepela ERP." };
  }

  if (payload.formatVersion !== BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Unsupported backup version: ${payload.formatVersion ?? "unknown"}.`,
    };
  }

  const data = payload.data;
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Backup data section is missing." };
  }

  for (const key of ["products", "customers", "sales", "stockSnapshots", "users"]) {
    if (!Array.isArray(data[key])) {
      return { ok: false, error: `Backup field "${key}" must be an array.` };
    }
  }

  for (const key of ["suppliers", "purchases"]) {
    if (data[key] != null && !Array.isArray(data[key])) {
      return { ok: false, error: `Backup field "${key}" must be an array.` };
    }
  }

  if (!data.settings || typeof data.settings !== "object") {
    return { ok: false, error: 'Backup field "settings" must be an object.' };
  }

  return {
    ok: true,
    data: {
      ...data,
      suppliers: data.suppliers ?? [],
      purchases: data.purchases ?? [],
    },
  };
}
