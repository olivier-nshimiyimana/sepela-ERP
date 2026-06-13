import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { normalizeProducts, validateProductFields } from "../data/defaultProducts";
import { DEFAULT_INVOICE_PROFILE, resolveInvoiceProfile } from "../data/defaultInvoiceProfile";
import { normalizePrimaryCurrency, roundUsd, usdToCdf } from "../utils/currency";
import { roundCdf } from "../utils/moneyRounding";
import { appError, DEFAULT_LOCALE, normalizeLocale } from "../i18n";
import { DEFAULT_EXPIRY_ALERT_DAYS } from "../utils/productExpiry";
import {
  findMatchingProductBatch,
  isSameProductBatch,
  resolveBatchTarget,
  sortProductsForCatalog,
} from "../utils/productBatches";
import {
  findMatchingSupplier,
  sortSuppliers,
  validatePurchaseItems,
  validateSupplierFields,
} from "../utils/suppliers";
import {
  findMatchingCustomer,
  sortCustomers,
  validateCustomerFields,
} from "../utils/customers";
import { PRODUCT_IMPORT_COLUMNS } from "../utils/productImport";
import { newEntityId, nowIso } from "../utils/ids";
import { receiptContextForNewSale } from "../domain/receiptTransaction";
import { getDatabase, isTauriRuntime, runSchemaMigrations } from "../db/client";
import {
  adjustStockQuantityItems,
  mapBreakdownRow,
  upsertInventoryBreakdown,
} from "../db/inventoryBreakdown";
import { migrateFromLocalStorageIfNeeded } from "../db/migrateFromLocalStorage";
import { cleanupProductsTable } from "../db/productCleanup";
import { rowToSale } from "../db/salesMapper";
import { loadStockSnapshots, syncDailyStockSnapshot } from "../db/stockSnapshots";
import { SYNC_STATUS } from "../db/schema";
import {
  isLicenseAcceptedInSettings,
  licenseAcceptanceForSettings,
  readLocalLicenseAcceptance,
  saveLocalLicenseAcceptance,
} from "../legal/license";
import {
  mergeAppSettingsForMerchant,
  migrateStoredAppSettings,
  resolveAppSettingsForMerchant,
  settingsForBackupExport,
  settingsFromBackupImport,
} from "../utils/merchantSettings";
import {
  activateDeviceOnCloud,
  applyCloudLeaseStatus,
  fetchCloudLeaseStatus,
  pushPendingToCloud,
} from "../db/syncQueue";
import { dbExecute, dbSelect } from "../db/sqlParams";
import { getActiveTenant, setActiveTenant } from "../db/tenant";
import {
  DEFAULT_PORTAL_API_TOKEN,
  DEFAULT_PORTAL_API_URL,
  deviceBindingToCloudFields,
} from "../config/portalDefaults";
import { emptyTenantCloudBinding, scrubCloudSyncForTenant } from "../db/tenantCloud";
import {
  deletePromotion as deletePromotionRow,
  loadProductCategories,
  loadPromotions,
  upsertProductCategory,
  upsertPromotion,
} from "../db/promotions";
import { evaluateCartPromotions } from "../utils/promotionEngine";
import { useLocalStorageData } from "../db/localStorageFallback";

const DatabaseContext = createContext(null);
const FALLBACK_COUNTER_KEY = "sepela-invoice-counter";
const LAST_BACKUP_EXPORT_AT_KEY = "last_backup_export_at";
const LAST_BACKUP_RESTORE_AT_KEY = "last_backup_restore_at";
const CLOUD_SYNC_API_BASE_URL_KEY = "cloud_sync_api_base_url";
const CLOUD_SYNC_API_TOKEN_KEY = "cloud_sync_api_token";
const CLOUD_SYNC_ENABLED_KEY = "cloud_sync_enabled";
const CLOUD_SYNC_MERCHANT_CODE_KEY = "cloud_sync_merchant_code";
const CLOUD_SYNC_BRANCH_CODE_KEY = "cloud_sync_branch_code";
const CLOUD_SYNC_DEVICE_CODE_KEY = "cloud_sync_device_code";
const CLOUD_SYNC_ACTIVATION_CODE_KEY = "cloud_sync_activation_code";
const CLOUD_SYNC_DEVICE_LABEL_KEY = "cloud_sync_device_label";
const CLOUD_SYNC_LEASE_STATUS_KEY = "cloud_sync_lease_status";
const CLOUD_SYNC_LEASE_TOKEN_KEY = "cloud_sync_lease_token";
const CLOUD_SYNC_LEASE_VALID_FROM_KEY = "cloud_sync_lease_valid_from";
const CLOUD_SYNC_LEASE_VALID_UNTIL_KEY = "cloud_sync_lease_valid_until";
const CLOUD_SYNC_LEASE_ISSUED_AT_KEY = "cloud_sync_lease_issued_at";
const CLOUD_SYNC_LAST_AT_KEY = "cloud_sync_last_at";
const CLOUD_SYNC_LAST_STATUS_KEY = "cloud_sync_last_status";
const CLOUD_SYNC_LAST_SUMMARY_KEY = "cloud_sync_last_summary";
const CLOUD_SYNC_LAST_ERROR_KEY = "cloud_sync_last_error";
const SYNCABLE_TABLES = [
  "products",
  "customers",
  "suppliers",
  "sales",
  "purchases",
  "settings",
  "stockSnapshots",
  "productCategories",
  "promotions",
];

const DEFAULT_CLOUD_SYNC = {
  enabled: false,
  apiBaseUrl: "",
  apiToken: "",
  merchantCode: "",
  branchCode: "",
  deviceCode: "",
  activationCode: "",
  deviceLabel: "",
  leaseStatus: "",
  leaseToken: "",
  leaseValidFrom: null,
  leaseValidUntil: null,
  leaseIssuedAt: null,
  lastSyncAt: null,
  lastSyncStatus: "idle",
  lastSyncSummary: "",
  lastSyncError: "",
};

function normalizeCloudSync(config) {
  return {
    ...DEFAULT_CLOUD_SYNC,
    ...config,
    enabled: !!config?.enabled,
    apiBaseUrl: String(config?.apiBaseUrl ?? "").trim(),
    apiToken: String(config?.apiToken ?? ""),
    merchantCode: String(config?.merchantCode ?? "").trim(),
    branchCode: String(config?.branchCode ?? "").trim(),
    deviceCode: String(config?.deviceCode ?? "").trim(),
    activationCode: String(config?.activationCode ?? "").trim(),
    deviceLabel: String(config?.deviceLabel ?? "").trim(),
    leaseStatus: String(config?.leaseStatus ?? "").trim(),
    leaseToken: String(config?.leaseToken ?? "").trim(),
    leaseValidFrom: config?.leaseValidFrom ?? null,
    leaseValidUntil: config?.leaseValidUntil ?? null,
    leaseIssuedAt: config?.leaseIssuedAt ?? null,
    lastSyncAt: config?.lastSyncAt ?? null,
    lastSyncStatus: config?.lastSyncStatus ?? "idle",
    lastSyncSummary: String(config?.lastSyncSummary ?? ""),
    lastSyncError: String(config?.lastSyncError ?? ""),
  };
}

function cloudSyncActivationState(activation) {
  return {
    activationCode: String(activation?.activationCode ?? "").trim(),
    deviceLabel: String(activation?.device?.label ?? "").trim(),
    leaseStatus: String(activation?.lease?.status ?? "").trim(),
    leaseToken: String(activation?.lease?.leaseToken ?? "").trim(),
    leaseValidFrom: activation?.lease?.validFrom ?? null,
    leaseValidUntil: activation?.lease?.validUntil ?? null,
    leaseIssuedAt: activation?.lease?.issuedAt ?? null,
  };
}

function buildProvisionalDeviceCode() {
  return newEntityId("desktop").replace(/_/g, "-").toLowerCase();
}

async function loadRawSettings(db) {
  const rows = await dbSelect(db, "SELECT value_json FROM settings WHERE key = 'app_settings'");
  if (!rows[0]?.value_json) {
    return {};
  }
  const raw = rows[0].value_json;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? raw : {};
}

async function loadSettings(db, merchantCode) {
  const raw = await loadRawSettings(db);
  return resolveAppSettingsForMerchant(raw, merchantCode);
}

async function saveSettings(db, settings) {
  const ts = nowIso();
  await dbExecute(
    db,
    `INSERT OR REPLACE INTO settings (key, value_json, updated_at, sync_status) VALUES ('app_settings', ?, ?, ?)`,
    [JSON.stringify(settings), ts, SYNC_STATUS.PENDING]
  );
}

async function persistSettingsForMerchant(db, merchantCode, patch) {
  const raw = await loadRawSettings(db);
  const merged = mergeAppSettingsForMerchant(raw, merchantCode, patch);
  await saveSettings(db, merged);
}

async function loadCloudSync(db) {
  const rows = await dbSelect(
    db,
    `SELECT key, value
     FROM app_meta
     WHERE key IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      CLOUD_SYNC_API_BASE_URL_KEY,
      CLOUD_SYNC_API_TOKEN_KEY,
      CLOUD_SYNC_ENABLED_KEY,
      CLOUD_SYNC_MERCHANT_CODE_KEY,
      CLOUD_SYNC_BRANCH_CODE_KEY,
      CLOUD_SYNC_DEVICE_CODE_KEY,
      CLOUD_SYNC_ACTIVATION_CODE_KEY,
      CLOUD_SYNC_DEVICE_LABEL_KEY,
      CLOUD_SYNC_LEASE_STATUS_KEY,
      CLOUD_SYNC_LEASE_TOKEN_KEY,
      CLOUD_SYNC_LEASE_VALID_FROM_KEY,
      CLOUD_SYNC_LEASE_VALID_UNTIL_KEY,
      CLOUD_SYNC_LEASE_ISSUED_AT_KEY,
      CLOUD_SYNC_LAST_AT_KEY,
      CLOUD_SYNC_LAST_STATUS_KEY,
      CLOUD_SYNC_LAST_SUMMARY_KEY,
      CLOUD_SYNC_LAST_ERROR_KEY,
    ]
  );
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return normalizeCloudSync({
    apiBaseUrl: map.get(CLOUD_SYNC_API_BASE_URL_KEY) ?? "",
    apiToken: map.get(CLOUD_SYNC_API_TOKEN_KEY) ?? "",
    enabled: map.get(CLOUD_SYNC_ENABLED_KEY) === "1",
    merchantCode: map.get(CLOUD_SYNC_MERCHANT_CODE_KEY) ?? "",
    branchCode: map.get(CLOUD_SYNC_BRANCH_CODE_KEY) ?? "",
    deviceCode: map.get(CLOUD_SYNC_DEVICE_CODE_KEY) ?? "",
    activationCode: map.get(CLOUD_SYNC_ACTIVATION_CODE_KEY) ?? "",
    deviceLabel: map.get(CLOUD_SYNC_DEVICE_LABEL_KEY) ?? "",
    leaseStatus: map.get(CLOUD_SYNC_LEASE_STATUS_KEY) ?? "",
    leaseToken: map.get(CLOUD_SYNC_LEASE_TOKEN_KEY) ?? "",
    leaseValidFrom: map.get(CLOUD_SYNC_LEASE_VALID_FROM_KEY) ?? null,
    leaseValidUntil: map.get(CLOUD_SYNC_LEASE_VALID_UNTIL_KEY) ?? null,
    leaseIssuedAt: map.get(CLOUD_SYNC_LEASE_ISSUED_AT_KEY) ?? null,
    lastSyncAt: map.get(CLOUD_SYNC_LAST_AT_KEY) ?? null,
    lastSyncStatus: map.get(CLOUD_SYNC_LAST_STATUS_KEY) ?? "idle",
    lastSyncSummary: map.get(CLOUD_SYNC_LAST_SUMMARY_KEY) ?? "",
    lastSyncError: map.get(CLOUD_SYNC_LAST_ERROR_KEY) ?? "",
  });
}

function buildDirtySyncPayload(data, includeSettings = false) {
  return {
    products: (data.products ?? []).filter((row) => row.syncStatus !== SYNC_STATUS.SYNCED),
    customers: (data.customers ?? []).filter((row) => row.syncStatus !== SYNC_STATUS.SYNCED),
    suppliers: (data.suppliers ?? []).filter((row) => row.syncStatus !== SYNC_STATUS.SYNCED),
    sales: (data.sales ?? []).filter((row) => row.syncStatus !== SYNC_STATUS.SYNCED),
    purchases: (data.purchases ?? []).filter((row) => row.syncStatus !== SYNC_STATUS.SYNCED),
    settings: includeSettings ? data.settings ?? [] : [],
    stockSnapshots: (data.stockSnapshots ?? []).filter((row) => row.syncStatus !== SYNC_STATUS.SYNCED),
    productCategories: (data.productCategories ?? []).filter(
      (row) => row.syncStatus !== SYNC_STATUS.SYNCED
    ),
    promotions: (data.promotions ?? []).filter((row) => row.syncStatus !== SYNC_STATUS.SYNCED),
  };
}

function countSyncItems(payload) {
  return SYNCABLE_TABLES.reduce((sum, table) => sum + (payload?.[table]?.length ?? 0), 0);
}

async function loadProducts(db, merchantCode) {
  const rows = await dbSelect(
    db,
    `     SELECT
       p.id, p.name, p.lot_number, p.expiration_date, p.price, p.stock, p.category_id,
       p.updated_at, p.sync_status,
       b.buy_unit, b.buy_unit_cost, b.qty_per_unit, b.item_size_label,
       b.stock_quantity_items, b.reorder_level_items, b.item_unit_cost
     FROM products p
     LEFT JOIN inventory_breakdown b ON b.product_id = p.id
     WHERE p.merchant_code = ?
     ORDER BY lower(p.name), p.expiration_date, p.lot_number`,
    [merchantCode]
  );
  return rows.map((r) => {
    const breakdown = mapBreakdownRow(r, r.stock);
    return {
      id: r.id,
      name: r.name,
      lotNumber: r.lot_number,
      expirationDate: r.expiration_date,
      price: r.price,
      categoryId: r.category_id ?? null,
      stock: breakdown.stockQuantityItems,
      ...breakdown,
      updatedAt: r.updated_at,
      syncStatus: r.sync_status,
    };
  });
}

async function loadCustomers(db, merchantCode) {
  const rows = await dbSelect(
    db,
    `SELECT id, name, phone, address, email, tax_number, client_tier, updated_at, sync_status
     FROM customers WHERE merchant_code = ? ORDER BY lower(name), phone`,
    [merchantCode]
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    email: row.email,
    taxNumber: row.tax_number,
    clientTier: row.client_tier ?? null,
    updatedAt: row.updated_at,
    syncStatus: row.sync_status,
  }));
}

async function loadSuppliers(db, merchantCode) {
  const rows = await dbSelect(
    db,
    "SELECT id, name, phone, address, updated_at, sync_status FROM suppliers WHERE merchant_code = ? ORDER BY lower(name), phone",
    [merchantCode]
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    updatedAt: row.updated_at,
    syncStatus: row.sync_status,
  }));
}

async function loadSales(db, merchantCode) {
  const saleRows = await dbSelect(
    db,
    "SELECT * FROM sales WHERE merchant_code = ? ORDER BY timestamp DESC",
    [merchantCode]
  );
  const out = [];
  for (const row of saleRows) {
    const items = await dbSelect(db, "SELECT * FROM sale_items WHERE sale_id = ?", [row.id]);
    out.push(rowToSale(row, items));
  }
  return out;
}

async function loadPurchases(db, merchantCode) {
  const purchaseRows = await dbSelect(
    db,
    "SELECT * FROM purchase_orders WHERE merchant_code = ? ORDER BY timestamp DESC",
    [merchantCode]
  );
  const out = [];
  for (const row of purchaseRows) {
    const items = await dbSelect(db, "SELECT * FROM purchase_items WHERE purchase_id = ?", [row.id]);
    out.push({
      id: row.id,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      supplierPhone: row.supplier_phone,
      supplierAddress: row.supplier_address,
      reference: row.reference,
      notes: row.notes,
      totalCost: row.total_cost,
      timestamp: row.timestamp,
      createdByUserId: row.created_by_user_id,
      createdByUserName: row.created_by_user_name,
      updatedAt: row.updated_at,
      syncStatus: row.sync_status,
      items: items.map((item) => ({
        id: item.id,
        purchaseId: item.purchase_id,
        productId: item.product_id,
        productName: item.product_name,
        lotNumber: item.lot_number,
        expirationDate: item.expiration_date,
        unitCost: item.unit_cost,
        qty: item.qty,
        lineTotal: item.line_total,
      })),
    });
  }
  return out;
}

async function loadSnapshotRows(db, merchantCode) {
  return loadStockSnapshots(db, merchantCode);
}

async function loadBackupHistory(db) {
  const rows = await dbSelect(
    db,
    "SELECT key, value FROM app_meta WHERE key IN (?, ?)",
    [LAST_BACKUP_EXPORT_AT_KEY, LAST_BACKUP_RESTORE_AT_KEY]
  );
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    lastExportAt: map[LAST_BACKUP_EXPORT_AT_KEY] ?? null,
    lastRestoreAt: map[LAST_BACKUP_RESTORE_AT_KEY] ?? null,
  };
}

async function upsertMeta(db, key, value, syncStatus = SYNC_STATUS.SYNCED) {
  await dbExecute(
    db,
    `INSERT OR REPLACE INTO app_meta (key, value, updated_at, sync_status) VALUES (?, ?, ?, ?)`,
    [key, value, nowIso(), syncStatus]
  );
}

async function persistCloudSyncConfig(db, config) {
  const normalized = normalizeCloudSync(config);
  await upsertMeta(db, CLOUD_SYNC_API_BASE_URL_KEY, normalized.apiBaseUrl);
  await upsertMeta(db, CLOUD_SYNC_API_TOKEN_KEY, normalized.apiToken);
  await upsertMeta(db, CLOUD_SYNC_ENABLED_KEY, normalized.enabled ? "1" : "0");
  await upsertMeta(db, CLOUD_SYNC_MERCHANT_CODE_KEY, normalized.merchantCode);
  await upsertMeta(db, CLOUD_SYNC_BRANCH_CODE_KEY, normalized.branchCode);
  await upsertMeta(db, CLOUD_SYNC_DEVICE_CODE_KEY, normalized.deviceCode);
  await upsertMeta(db, CLOUD_SYNC_ACTIVATION_CODE_KEY, normalized.activationCode);
  await upsertMeta(db, CLOUD_SYNC_DEVICE_LABEL_KEY, normalized.deviceLabel);
  await upsertMeta(db, CLOUD_SYNC_LEASE_STATUS_KEY, normalized.leaseStatus);
  await upsertMeta(db, CLOUD_SYNC_LEASE_TOKEN_KEY, normalized.leaseToken);
  await upsertMeta(db, CLOUD_SYNC_LEASE_VALID_FROM_KEY, normalized.leaseValidFrom ?? "");
  await upsertMeta(db, CLOUD_SYNC_LEASE_VALID_UNTIL_KEY, normalized.leaseValidUntil ?? "");
  await upsertMeta(db, CLOUD_SYNC_LEASE_ISSUED_AT_KEY, normalized.leaseIssuedAt ?? "");
}

async function persistCloudSyncResult(db, result) {
  const normalized = normalizeCloudSync(result);
  await upsertMeta(db, CLOUD_SYNC_LAST_AT_KEY, normalized.lastSyncAt ?? "");
  await upsertMeta(db, CLOUD_SYNC_LAST_STATUS_KEY, normalized.lastSyncStatus ?? "idle");
  await upsertMeta(db, CLOUD_SYNC_LAST_SUMMARY_KEY, normalized.lastSyncSummary ?? "");
  await upsertMeta(db, CLOUD_SYNC_LAST_ERROR_KEY, normalized.lastSyncError ?? "");
}

function buildLeaseStatusQuery(config) {
  if (config.leaseToken) {
    return { leaseToken: config.leaseToken };
  }
  if (config.deviceCode && config.activationCode) {
    return { deviceCode: config.deviceCode, activationCode: config.activationCode };
  }
  return null;
}

async function refreshCloudLeaseFromPortal(db, config) {
  const normalized = normalizeCloudSync(config);
  if (!normalized.apiBaseUrl || !normalized.apiToken) {
    return { ok: false, allowed: false, error: "Set the cloud API URL and bearer token first." };
  }

  const query = buildLeaseStatusQuery(normalized);
  if (!query) {
    return { ok: true, allowed: false, reason: "This device is not activated.", config: normalized };
  }

  const canRetryByBinding =
    !!normalized.deviceCode &&
    !!normalized.activationCode &&
    !!normalized.leaseToken &&
    !!query.leaseToken;
  let status = null;
  try {
    status = await fetchCloudLeaseStatus(normalized.apiBaseUrl, query, {
      apiToken: normalized.apiToken,
    });
  } catch (error) {
    if (!canRetryByBinding) {
      throw error;
    }
  }
  if (!status?.allowed && canRetryByBinding) {
    // Lease token may be stale after re-activation; fallback to explicit device+activation lookup.
    status = await fetchCloudLeaseStatus(
      normalized.apiBaseUrl,
      {
        deviceCode: normalized.deviceCode,
        activationCode: normalized.activationCode,
      },
      { apiToken: normalized.apiToken }
    );
  }
  const activeTenant = await getActiveTenant(db);
  const nextConfig = applyCloudLeaseStatus(normalized, status, {
    activeMerchantCode: activeTenant.merchantCode,
  });
  await persistCloudSyncConfig(db, nextConfig);

  if (!status.allowed) {
    await persistCloudSyncResult(db, {
      ...nextConfig,
      lastSyncAt: nowIso(),
      lastSyncStatus: "blocked",
      lastSyncSummary: status.reason ?? "Cloud activation is no longer valid.",
      lastSyncError: status.reason ?? "Cloud activation is no longer valid.",
    });
  }

  return {
    ok: true,
    allowed: !!status.allowed,
    reason: status.reason ?? null,
    config: nextConfig,
    status,
  };
}

async function updateSqliteSyncStatus(db, table, keyField, ids, status) {
  const uniqueIds = [...new Set((ids ?? []).filter(Boolean))];
  if (!uniqueIds.length) return;
  const placeholders = uniqueIds.map(() => "?").join(", ");
  await dbExecute(
    db,
    `UPDATE ${table} SET sync_status = ? WHERE ${keyField} IN (${placeholders})`,
    [status, ...uniqueIds]
  );
}

function allocateInvoiceNumber(settings) {
  const prefix = settings.invoiceProfile?.invoicePrefix ?? "SEP";
  const clean =
    (prefix || "SEP").toString().replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || "SEP";
  let n = settings.invoiceCounter ?? 1;
  if (Number.isNaN(n) || n < 1) n = 1;
  const invoiceNumber = `${clean}-${String(n).padStart(5, "0")}`;
  settings.invoiceCounter = n + 1;
  return invoiceNumber;
}

export function DatabaseProvider({ children }) {
  const fallback = useLocalStorageData();
  const [sqlite, setSqlite] = useState({
    ready: false,
    error: null,
    products: [],
    customers: [],
    suppliers: [],
    sales: [],
    purchases: [],
    stockSnapshots: [],
    productCategories: [],
    promotions: [],
    backupHistory: { lastExportAt: null, lastRestoreAt: null },
    cloudSync: DEFAULT_CLOUD_SYNC,
    activeTenant: { merchantCode: "local", branchCode: "" },
    settings: null,
  });

  const refreshSqlite = useCallback(async (db) => {
    const activeTenant = await getActiveTenant(db);
    const merchantCode = activeTenant.merchantCode;
    const [
      products,
      customers,
      suppliers,
      sales,
      purchases,
      stockSnapshots,
      productCategories,
      promotions,
      backupHistory,
      settings,
      cloudSync,
    ] = await Promise.all([
      loadProducts(db, merchantCode),
      loadCustomers(db, merchantCode),
      loadSuppliers(db, merchantCode),
      loadSales(db, merchantCode),
      loadPurchases(db, merchantCode),
      loadSnapshotRows(db, merchantCode),
      loadProductCategories(db, merchantCode),
      loadPromotions(db, merchantCode),
      loadBackupHistory(db),
      loadSettings(db, merchantCode),
      loadCloudSync(db),
    ]);
    setSqlite({
      ready: true,
      error: null,
      products,
      customers,
      suppliers,
      sales,
      purchases,
      stockSnapshots,
      productCategories,
      promotions,
      backupHistory,
      cloudSync,
      activeTenant,
      settings,
    });
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let cancelled = false;
    (async () => {
      try {
        const db = await getDatabase();
        if (!db || cancelled) return;
        await runSchemaMigrations(db);
        await migrateFromLocalStorageIfNeeded(db);
        await cleanupProductsTable(db);
        await syncDailyStockSnapshot(db);
        const activeTenant = await getActiveTenant(db);
        const rawSettings = await loadRawSettings(db);
        const migratedSettings = migrateStoredAppSettings(
          rawSettings,
          activeTenant.merchantCode
        );
        if (
          !rawSettings.invoiceProfiles &&
          (rawSettings.invoiceProfile || rawSettings.invoiceCounter)
        ) {
          await saveSettings(db, migratedSettings);
        }
        const cloudBeforeSeed = await loadCloudSync(db);
        if (DEFAULT_PORTAL_API_TOKEN && !String(cloudBeforeSeed.apiToken ?? "").trim()) {
          await persistCloudSyncConfig(db, {
            ...cloudBeforeSeed,
            apiBaseUrl: String(cloudBeforeSeed.apiBaseUrl ?? "").trim() || DEFAULT_PORTAL_API_URL,
            apiToken: DEFAULT_PORTAL_API_TOKEN,
          });
        }
        await refreshSqlite(db);

        const cloudSync = await loadCloudSync(db);
        if (!cancelled && buildLeaseStatusQuery(cloudSync)) {
          try {
            await refreshCloudLeaseFromPortal(db, cloudSync);
            if (!cancelled) await refreshSqlite(db);
          } catch {
            /* keep cached lease if portal is unreachable on startup */
          }
        }
      } catch (e) {
        if (!cancelled) {
          setSqlite((s) => ({ ...s, ready: true, error: String(e?.message ?? e) }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshSqlite]);

  const inTauri = isTauriRuntime();

  const value = useMemo(() => {
    if (inTauri) {
      if (sqlite.error) {
        return { ready: false, storageMode: "error", error: sqlite.error };
      }
      if (sqlite.ready && sqlite.settings) {
        return buildSqliteApi(sqlite, refreshSqlite);
      }
      return { ready: false, storageMode: "loading" };
    }
    return buildFallbackApi(fallback);
  }, [inTauri, fallback, sqlite, refreshSqlite]);

  if (inTauri && !value.ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-gray-500 p-6 text-center">
        {value.error ? (
          <>
            <p className="text-red-400 font-bold mb-2">Database error</p>
            <p className="text-sm max-w-md">{value.error}</p>
            <p className="text-xs mt-4 text-gray-600">
              Check D:\SepelaERP\data\sepela.db or C:\SepelaERP\data\sepela.db. If the file is corrupt, back it up and remove it, then run npm run tauri dev again.
            </p>
          </>
        ) : (
          "Loading database…"
        )}
      </div>
    );
  }

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

function buildFallbackApi(f) {
  const lang = () => f.language ?? DEFAULT_LOCALE;
  return {
    storageMode: f.storageMode,
    ready: f.ready,
    products: f.products,
    customers: f.customers,
    suppliers: f.suppliers,
    sales: f.sales,
    purchases: f.purchases,
    stockSnapshots: [],
    productCategories: [],
    promotions: [],
    evaluateCartPromotions,
    backupHistory: f.backupHistory,
    cloudSync: f.cloudSync,
    exchangeRate: f.exchangeRate,
    primaryCurrency: f.primaryCurrency,
    language: f.language ?? DEFAULT_LOCALE,
    expiryAlertDays: f.expiryAlertDays,
    invoiceProfile: f.invoiceProfile,
    trainingMode: f.trainingMode,
    setTrainingMode: f.setTrainingMode,
    recordSale: (payload) => f.recordSale({ ...payload, trainingMode: f.trainingMode }),
    recordPurchase: f.recordPurchase,
    refundSale: f.refundSale,
    incrementCopyIndex: f.incrementCopyIndex,
    updateSaleNotes: f.updateSaleNotes,
    addProduct: (fields) => {
      const validated = validateProductFields(fields, lang());
      if (!validated.ok) return validated;
      f.setProducts((prev) =>
        sortProductsForCatalog([
          ...normalizeProducts(prev),
          { id: newEntityId("prd"), ...validated.data },
        ])
      );
      return { ok: true };
    },
    updateProduct: (id, fields) => {
      const validated = validateProductFields(fields, lang());
      if (!validated.ok) return validated;
      f.setProducts((prev) =>
        sortProductsForCatalog(
          normalizeProducts(prev).map((p) => (p.id === id ? { ...p, ...validated.data } : p))
        )
      );
      return { ok: true };
    },
    deleteProduct: (id) => {
      f.setProducts((prev) => prev.filter((p) => p.id !== id));
      return { ok: true };
    },
    importProducts: async (rows) => {
      if (!Array.isArray(rows) || rows.length === 0) {
        return { ok: false, error: appError("csvNoRows", lang()) };
      }

      const ts = nowIso();
      const nextProducts = sortProductsForCatalog([...f.products]);
      let created = 0;
      let updated = 0;

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const validated = validateProductFields({
          name: row.name,
          lotNumber: row.lot_number,
          expirationDate: row.expiration_date,
          price: row.price,
          stock: row.stock,
          stockQuantityItems: row.stock,
          buyUnit: row.buy_unit,
          buyUnitCost: row.buy_unit_cost,
          qtyPerUnit: row.qty_per_unit,
          itemSizeLabel: row.item_size_label,
          reorderLevelItems: row.reorder_level_items,
        }, lang());
        if (!validated.ok) {
          return { ok: false, error: appError("csvRow", lang(), { row: i + 2, message: validated.error }) };
        }

        const requestedId = row.id?.trim() || null;
        const existingById = requestedId
          ? nextProducts.find((product) => product.id === requestedId) ?? null
          : null;
        const matchingBatch = findMatchingProductBatch(nextProducts, validated.data);
        const canUpdateRequested = existingById && isSameProductBatch(existingById, validated.data);
        const target = canUpdateRequested ? existingById : matchingBatch;

        if (target) {
          const targetId = target.id;
          const targetIndex = nextProducts.findIndex((product) => product.id === targetId);
          nextProducts[targetIndex] = {
            ...target,
            name: validated.data.name,
            lotNumber: validated.data.lotNumber,
            expirationDate: validated.data.expirationDate,
            price: validated.data.price,
            stock: (target.stock ?? 0) + validated.data.stock,
            updatedAt: ts,
            syncStatus: "PENDING",
          };
          updated += 1;
        } else {
          nextProducts.push({
            id: requestedId && !existingById ? requestedId : newEntityId("prd"),
            ...validated.data,
            updatedAt: ts,
            syncStatus: "PENDING",
          });
          created += 1;
        }
      }

      f.setProducts(sortProductsForCatalog(nextProducts));
      return { ok: true, created, updated, count: rows.length };
    },
    restockProduct: (id, amount, lotNumber, expirationDate) =>
      restockLogic(f, id, amount, lotNumber, expirationDate, lang()),
    decrementStockForSale: (saleItems) => {
      f.setProducts((prev) =>
        normalizeProducts(prev).map((p) => {
          const line = saleItems.find((item) => item.productId === p.id);
          if (!line) return p;
          return { ...p, stock: Math.max(0, p.stock - line.qty) };
        })
      );
    },
    restoreStockForRefund: (saleItems) => {
      if (!saleItems?.length) return;
      f.setProducts((prev) =>
        normalizeProducts(prev).map((p) => {
          const line = saleItems.find((item) => item.productId === p.id);
          if (!line) return p;
          return { ...p, stock: p.stock + line.qty };
        })
      );
    },
    updateExchangeRate: (rate) => {
      const parsed = parseFloat(rate);
      if (Number.isNaN(parsed) || parsed <= 0) return { ok: false, error: "Enter a valid exchange rate." };
      f.setExchangeRate(parsed);
      return { ok: true };
    },
    updateExpiryAlertDays: (days) => {
      const parsed = parseInt(days, 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 365) {
        return { ok: false, error: "Alert window must be between 1 and 365 days." };
      }
      f.setExpiryAlertDays(parsed);
      return { ok: true };
    },
    updateInvoiceProfile: (partial) => {
      f.setInvoiceProfileRaw((prev) => ({ ...DEFAULT_INVOICE_PROFILE, ...prev, ...partial }));
      return { ok: true };
    },
    saveAllSettings: async ({
      exchangeRate,
      primaryCurrency,
      language,
      expiryAlertDays,
      invoiceProfile,
      trainingMode,
    }) => {
      const parsedRate = parseFloat(exchangeRate);
      if (Number.isNaN(parsedRate) || parsedRate <= 0) {
        return { ok: false, error: "Enter a valid exchange rate." };
      }

      const parsedDays = parseInt(expiryAlertDays, 10);
      if (Number.isNaN(parsedDays) || parsedDays < 1 || parsedDays > 365) {
        return { ok: false, error: "Alert window must be between 1 and 365 days." };
      }

      f.setExchangeRate(parsedRate);
      f.setPrimaryCurrency(primaryCurrency);
      if (language !== undefined && f.setLanguage) f.setLanguage(normalizeLocale(language));
      f.setExpiryAlertDays(parsedDays);
      f.setInvoiceProfileRaw({
        ...DEFAULT_INVOICE_PROFILE,
        ...invoiceProfile,
      });
      f.setTrainingMode(!!trainingMode);
      return { ok: true };
    },
    productImportColumns: PRODUCT_IMPORT_COLUMNS,
    exportBackupData: async () => {
      f.setLastBackupExportAt(nowIso());
      return {
        products: f.products,
        customers: f.customers,
        suppliers: f.suppliers,
        sales: f.sales,
        purchases: f.purchases,
        stockSnapshots: [],
        settings: {
          exchangeRate: f.exchangeRate,
          primaryCurrency: f.primaryCurrency,
          language: f.language ?? DEFAULT_LOCALE,
          expiryAlertDays: f.expiryAlertDays,
          invoiceProfile: f.invoiceProfile,
          invoiceCounter: parseInt(localStorage.getItem(FALLBACK_COUNTER_KEY) || "1", 10),
          trainingMode: !!f.trainingMode,
        },
      };
    },
    restoreBackupData: async (data) => {
      f.setProducts(data.products ?? []);
      f.setCustomers(data.customers ?? []);
      f.setSuppliers(data.suppliers ?? []);
      f.setSales(data.sales ?? []);
      f.setPurchases(data.purchases ?? []);
      f.setExchangeRate(data.settings.exchangeRate ?? 2850);
      f.setPrimaryCurrency(data.settings.primaryCurrency);
      if (f.setLanguage) f.setLanguage(normalizeLocale(data.settings.language ?? DEFAULT_LOCALE));
      f.setExpiryAlertDays(data.settings.expiryAlertDays ?? DEFAULT_EXPIRY_ALERT_DAYS);
      f.setInvoiceProfileRaw({
        ...DEFAULT_INVOICE_PROFILE,
        ...(data.settings.invoiceProfile ?? {}),
      });
      f.setTrainingMode(!!data.settings.trainingMode);
      localStorage.setItem(
        FALLBACK_COUNTER_KEY,
        String(Math.max(1, parseInt(data.settings.invoiceCounter ?? 1, 10) || 1))
      );
      f.setLastBackupRestoreAt(nowIso());
      return { ok: true };
    },
    saveCustomer: f.saveCustomer,
    saveSupplier: f.saveSupplier,
    updateCustomer: f.updateCustomer,
    deleteCustomer: f.deleteCustomer,
    savePortalConnection: f.savePortalConnection,
    syncDeviceBindingFromPortal: f.syncDeviceBindingFromPortal,
    getDeviceActivation: f.getDeviceActivation,
    saveCloudSyncConfig: f.saveCloudSyncConfig,
    activateCloudDevice: f.activateCloudDevice,
    refreshCloudLeaseStatus: f.refreshCloudLeaseStatus,
    pushPendingSync: f.pushPendingSync,
    saveProductCategory: async () => ({ ok: false, error: "Categories require the desktop database." }),
    savePromotion: async () => ({ ok: false, error: "Promotions require the desktop database." }),
    deletePromotion: async () => ({ ok: false, error: "Promotions require the desktop database." }),
    listPendingSync: f.listPendingSync,
    licenseAccepted: !!readLocalLicenseAcceptance(),
    acceptLicenseAgreement: async (locale) => {
      if (locale !== undefined && f.setLanguage) f.setLanguage(normalizeLocale(locale));
      saveLocalLicenseAcceptance();
      return { ok: true };
    },
  };
}

function buildSqliteApi(sqlite, refreshSqlite) {
  const settings =
    sqlite.settings ??
    resolveAppSettingsForMerchant({}, sqlite.activeTenant?.merchantCode ?? "local");
  const lang = () => settings.language ?? DEFAULT_LOCALE;

  const persistSettings = async (next) => {
    const db = await getDatabase();
    const { merchantCode } = await getActiveTenant(db);
    await persistSettingsForMerchant(db, merchantCode, next);
    await refreshSqlite(db);
  };

  const refreshWithSnapshots = async (db) => {
    const { merchantCode } = await getActiveTenant(db);
    await syncDailyStockSnapshot(db, null, new Date(), merchantCode);
    await refreshSqlite(db);
  };

  const loadDirtySettingsRows = async (db) => {
    const rows = await dbSelect(
      db,
      "SELECT key, value_json, updated_at, sync_status FROM settings WHERE sync_status != 'SYNCED'"
    );
    return rows.map((row) => ({
      key: row.key,
      value: JSON.parse(row.value_json),
      updatedAt: row.updated_at,
      syncStatus: row.sync_status,
    }));
  };

  const refreshCloudLeaseStatus = async (overrides = {}) => {
    const db = await getDatabase();
    try {
      const result = await refreshCloudLeaseFromPortal(db, { ...sqlite.cloudSync, ...overrides });
      await refreshSqlite(db);
      return result;
    } catch (error) {
      return { ok: false, allowed: false, error: error?.message ?? String(error) };
    }
  };

  const pushPendingSync = async (overrides = {}) => {
    const db = await getDatabase();
    const activeTenant = await getActiveTenant(db);
    const config = normalizeCloudSync({
      ...scrubCloudSyncForTenant(await loadCloudSync(db), activeTenant.merchantCode),
      ...overrides,
    });
    if (!config.apiBaseUrl) {
      return { ok: false, error: "Set the cloud API URL first." };
    }

    if (buildLeaseStatusQuery(config)) {
      try {
        const leaseCheck = await refreshCloudLeaseFromPortal(db, config);
        if (!leaseCheck.allowed) {
          await refreshSqlite(db);
          return {
            ok: false,
            error: leaseCheck.reason ?? "Cloud activation is no longer valid.",
          };
        }
      } catch (error) {
        return { ok: false, error: error?.message ?? String(error) };
      }
    }

    const activeConfig = config;
    const syncMerchantCode = String(activeConfig.merchantCode ?? activeTenant.merchantCode ?? "").trim();

    if (activeConfig.leaseToken) {
      const leaseMerchant = String(activeConfig.merchantCode ?? "").trim();
      if (leaseMerchant && leaseMerchant !== syncMerchantCode) {
        return {
          ok: false,
          error: `This device lease is for "${leaseMerchant}" but you are signed in as "${syncMerchantCode}". Activate the device for the current merchant in Settings.`,
        };
      }
    }

    const dirtySettings = await loadDirtySettingsRows(db);
    const [products, customers, suppliers, sales, purchases, stockSnapshots, productCategories, promotions] =
      await Promise.all([
      dbSelect(
        db,
        `SELECT p.id, p.name, p.lot_number, p.expiration_date, p.price, p.stock, p.category_id,
                p.updated_at, p.sync_status,
                b.buy_unit, b.buy_unit_cost, b.qty_per_unit, b.item_size_label,
                b.stock_quantity_items, b.reorder_level_items, b.item_unit_cost
         FROM products p
         LEFT JOIN inventory_breakdown b ON b.product_id = p.id
         WHERE p.merchant_code = ?`,
        [syncMerchantCode]
      ).then((rows) =>
        rows.map((r) => {
          const breakdown = mapBreakdownRow(r, r.stock);
          return {
            id: r.id,
            name: r.name,
            lotNumber: r.lot_number,
            expirationDate: r.expiration_date,
            price: r.price,
            stock: r.stock,
            categoryId: r.category_id ?? null,
            updatedAt: r.updated_at,
            syncStatus: r.sync_status,
            ...breakdown,
          };
        })
      ),
      loadCustomers(db, syncMerchantCode),
      loadSuppliers(db, syncMerchantCode),
      loadSales(db, syncMerchantCode),
      loadPurchases(db, syncMerchantCode),
      loadSnapshotRows(db, syncMerchantCode),
      loadProductCategories(db, syncMerchantCode),
      loadPromotions(db, syncMerchantCode),
    ]);
    const payload = buildDirtySyncPayload(
      {
        products,
        customers,
        suppliers,
        sales,
        purchases,
        settings: dirtySettings,
        stockSnapshots,
        productCategories,
        promotions,
      },
      true
    );
    const sentCount = countSyncItems(payload);
    if (sentCount === 0) {
      await persistCloudSyncResult(db, {
        ...config,
        lastSyncAt: nowIso(),
        lastSyncStatus: "idle",
        lastSyncSummary: "Nothing to sync.",
        lastSyncError: "",
      });
      await refreshSqlite(db);
      return { ok: true, syncedCount: 0, failedCount: 0, remainingCount: 0, message: "Nothing to sync." };
    }

    try {
      const result = await pushPendingToCloud(activeConfig.apiBaseUrl, payload, {
        apiToken: activeConfig.apiToken,
        merchantCode: syncMerchantCode,
        branchCode: activeConfig.branchCode,
        deviceCode: activeConfig.deviceCode,
        leaseToken: activeConfig.leaseToken,
        source: "sqlite",
      });

      await updateSqliteSyncStatus(db, "products", "id", result.synced.products, SYNC_STATUS.SYNCED);
      await updateSqliteSyncStatus(
        db,
        "inventory_breakdown",
        "product_id",
        result.synced.products,
        SYNC_STATUS.SYNCED
      );
      await updateSqliteSyncStatus(db, "customers", "id", result.synced.customers, SYNC_STATUS.SYNCED);
      await updateSqliteSyncStatus(db, "suppliers", "id", result.synced.suppliers, SYNC_STATUS.SYNCED);
      await updateSqliteSyncStatus(db, "sales", "id", result.synced.sales, SYNC_STATUS.SYNCED);
      await updateSqliteSyncStatus(db, "purchase_orders", "id", result.synced.purchases, SYNC_STATUS.SYNCED);
      await updateSqliteSyncStatus(db, "settings", "key", result.synced.settings, SYNC_STATUS.SYNCED);
      await updateSqliteSyncStatus(db, "stock_snapshots", "id", result.synced.stockSnapshots, SYNC_STATUS.SYNCED);
      await updateSqliteSyncStatus(
        db,
        "product_categories",
        "id",
        result.synced.productCategories,
        SYNC_STATUS.SYNCED
      );
      await updateSqliteSyncStatus(db, "promotions", "id", result.synced.promotions, SYNC_STATUS.SYNCED);

      await updateSqliteSyncStatus(db, "products", "id", result.failed.products, SYNC_STATUS.FAILED);
      await updateSqliteSyncStatus(
        db,
        "inventory_breakdown",
        "product_id",
        result.failed.products,
        SYNC_STATUS.FAILED
      );
      await updateSqliteSyncStatus(db, "customers", "id", result.failed.customers, SYNC_STATUS.FAILED);
      await updateSqliteSyncStatus(db, "suppliers", "id", result.failed.suppliers, SYNC_STATUS.FAILED);
      await updateSqliteSyncStatus(db, "sales", "id", result.failed.sales, SYNC_STATUS.FAILED);
      await updateSqliteSyncStatus(db, "purchase_orders", "id", result.failed.purchases, SYNC_STATUS.FAILED);
      await updateSqliteSyncStatus(db, "settings", "key", result.failed.settings, SYNC_STATUS.FAILED);
      await updateSqliteSyncStatus(db, "stock_snapshots", "id", result.failed.stockSnapshots, SYNC_STATUS.FAILED);
      await updateSqliteSyncStatus(
        db,
        "product_categories",
        "id",
        result.failed.productCategories,
        SYNC_STATUS.FAILED
      );
      await updateSqliteSyncStatus(db, "promotions", "id", result.failed.promotions, SYNC_STATUS.FAILED);

      const syncedCount = countSyncItems(result.synced);
      const failedCount = countSyncItems(result.failed);
      await persistCloudSyncResult(db, {
        ...activeConfig,
        lastSyncAt: nowIso(),
        lastSyncStatus: failedCount ? "partial" : "success",
        lastSyncSummary: result.message ?? `Synced ${syncedCount} item(s).`,
        lastSyncError: failedCount ? `${failedCount} item(s) still need attention.` : "",
      });
      await refreshSqlite(db);
      return {
        ok: true,
        syncedCount,
        failedCount,
        remainingCount: sentCount - syncedCount,
        message: result.message ?? `Synced ${syncedCount} item(s).`,
      };
    } catch (error) {
      await persistCloudSyncResult(db, {
        ...activeConfig,
        lastSyncAt: nowIso(),
        lastSyncStatus: "failed",
        lastSyncSummary: "Cloud sync failed.",
        lastSyncError: error?.message ?? String(error),
      });
      await refreshSqlite(db);
      return { ok: false, error: error?.message ?? String(error) };
    }
  };

  const applyActiveTenant = async ({ merchantCode, branchCode }) => {
    const code = String(merchantCode ?? "").trim();
    if (!code) {
      return { ok: false, error: "Merchant code is required." };
    }
    const db = await getDatabase();
    const prev = await getActiveTenant(db);
    await setActiveTenant(db, {
      merchantCode: code,
      branchCode: branchCode !== undefined ? String(branchCode).trim() : prev.branchCode,
    });
    const cloud = await loadCloudSync(db);
    const merchantChanged = prev.merchantCode !== code;
    const nextBranch =
      branchCode !== undefined ? String(branchCode).trim() : merchantChanged ? "" : cloud.branchCode;

    const scoped = scrubCloudSyncForTenant(cloud, code);
    await persistCloudSyncConfig(
      db,
      merchantChanged
        ? {
            ...scoped,
            merchantCode: code,
            branchCode: nextBranch || scoped.branchCode || "",
          }
        : {
            ...cloud,
            merchantCode: code,
            branchCode: nextBranch,
          }
    );
    await refreshSqlite(db);
    return { ok: true, merchantCode: code };
  };

  return {
    storageMode: "sqlite",
    ready: true,
    activeTenant: sqlite.activeTenant ?? { merchantCode: "local", branchCode: "" },
    applyActiveTenant,
    products: sqlite.products,
    customers: sqlite.customers,
    suppliers: sqlite.suppliers,
    sales: sqlite.sales,
    purchases: sqlite.purchases,
    stockSnapshots: sqlite.stockSnapshots,
    productCategories: sqlite.productCategories,
    promotions: sqlite.promotions,
    evaluateCartPromotions,
    backupHistory: sqlite.backupHistory,
    cloudSync: normalizeCloudSync(
      scrubCloudSyncForTenant(sqlite.cloudSync, sqlite.activeTenant?.merchantCode ?? "local")
    ),
    exchangeRate: settings.exchangeRate,
    primaryCurrency: settings.primaryCurrency,
    language: settings.language ?? DEFAULT_LOCALE,
    expiryAlertDays: settings.expiryAlertDays,
    invoiceProfile: resolveInvoiceProfile(
      { ...DEFAULT_INVOICE_PROFILE, ...settings.invoiceProfile },
      settings.language ?? DEFAULT_LOCALE
    ),
    trainingMode: !!settings.trainingMode,
    setTrainingMode: async (v) => {
      await persistSettings({ ...settings, trainingMode: !!v });
    },
    saveSupplier: async (fields) => {
      const validated = validateSupplierFields(fields, lang());
      if (!validated.ok) return validated;
      const db = await getDatabase();
      const { merchantCode } = await getActiveTenant(db);
      const ts = nowIso();
      const existing = findMatchingSupplier(sqlite.suppliers, validated.data);
      const id = existing?.id ?? newEntityId("sup");
      await dbExecute(
        db,
        `INSERT INTO suppliers (id, name, phone, address, merchant_code, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           phone = excluded.phone,
           address = excluded.address,
           merchant_code = excluded.merchant_code,
           updated_at = excluded.updated_at,
           sync_status = excluded.sync_status`,
        [
          id,
          validated.data.name,
          validated.data.phone,
          validated.data.address,
          merchantCode,
          ts,
          SYNC_STATUS.PENDING,
        ]
      );
      await refreshSqlite(db);
      return {
        ok: true,
        supplier: {
          id,
          name: validated.data.name,
          phone: validated.data.phone,
          address: validated.data.address,
          updatedAt: ts,
          syncStatus: SYNC_STATUS.PENDING,
        },
      };
    },
    saveCustomer: async (fields) => {
      const validated = validateCustomerFields(fields, lang());
      if (!validated.ok) return validated;
      const db = await getDatabase();
      const { merchantCode } = await getActiveTenant(db);
      const ts = nowIso();
      const existing = findMatchingCustomer(sqlite.customers, validated.data);
      const id = existing?.id ?? newEntityId("cus");
      await dbExecute(
        db,
        `INSERT INTO customers (id, name, phone, address, email, tax_number, client_tier, merchant_code, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           phone = excluded.phone,
           address = excluded.address,
           email = excluded.email,
           tax_number = excluded.tax_number,
           client_tier = excluded.client_tier,
           merchant_code = excluded.merchant_code,
           updated_at = excluded.updated_at,
           sync_status = excluded.sync_status`,
        [
          id,
          validated.data.name,
          validated.data.phone,
          validated.data.address,
          validated.data.email,
          validated.data.taxNumber,
          validated.data.clientTier ?? null,
          merchantCode,
          ts,
          SYNC_STATUS.PENDING,
        ]
      );
      await refreshSqlite(db);
      return {
        ok: true,
        customer: {
          id,
          name: validated.data.name,
          phone: validated.data.phone,
          address: validated.data.address,
          email: validated.data.email,
          taxNumber: validated.data.taxNumber,
          clientTier: validated.data.clientTier ?? null,
          updatedAt: ts,
          syncStatus: SYNC_STATUS.PENDING,
        },
      };
    },
    updateCustomer: async (id, fields) => {
      const validated = validateCustomerFields(fields, lang());
      if (!validated.ok) return validated;
      const db = await getDatabase();
      const ts = nowIso();
      const existing = sqlite.customers.find((customer) => customer.id === id);
      if (!existing) return { ok: false, error: appError("clientNotFound", lang()) };
      await dbExecute(
        db,
        `UPDATE customers
         SET name = ?, phone = ?, address = ?, email = ?, tax_number = ?, client_tier = ?, updated_at = ?, sync_status = ?
         WHERE id = ?`,
        [
          validated.data.name,
          validated.data.phone,
          validated.data.address,
          validated.data.email,
          validated.data.taxNumber,
          validated.data.clientTier ?? null,
          ts,
          SYNC_STATUS.PENDING,
          id,
        ]
      );
      await refreshSqlite(db);
      return {
        ok: true,
        customer: {
          ...existing,
          ...validated.data,
          updatedAt: ts,
          syncStatus: SYNC_STATUS.PENDING,
        },
      };
    },
    deleteCustomer: async (id) => {
      const db = await getDatabase();
      await dbExecute(db, `DELETE FROM customers WHERE id = ?`, [id]);
      await refreshSqlite(db);
      return { ok: true };
    },
    recordSale: async (payload) => {
      const db = await getDatabase();
      const { merchantCode: activeMerchant } = await getActiveTenant(db);
      const sessionMerchant = String(payload.merchantCode ?? "").trim();
      const merchantCode = sessionMerchant || activeMerchant;
      if (sessionMerchant && sessionMerchant !== activeMerchant) {
        return {
          ok: false,
          error: `Signed-in store (${sessionMerchant}) does not match this device (${activeMerchant}). Sign out and sign in again.`,
        };
      }
      const ts = nowIso();
      const ctx = receiptContextForNewSale({ trainingMode: settings.trainingMode });
      const invoiceNumber = allocateInvoiceNumber(settings);
      const id = newEntityId("inv");
      const { items, invoicePrefix, trainingMode: _tm, ...rest } = payload;

      await dbExecute(
        db,
        `INSERT INTO sales (
          id, invoice_number, timestamp, status, receipt_type, transaction_type, sdc_receipt_code,
          copy_index, method, method_label, total_usd, total_cdf, change_due_usd, change_due_cdf,
          amount_received, amount_received_primary, reference, card_last_four, cashier_id, cashier_name,
          customer_id, customer_name, customer_phone, customer_address, customer_email, customer_tax_number,
          exchange_rate, promotion_discount_usd, manual_discount_usd, applied_promotion_id, merchant_code,
          updated_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          invoiceNumber,
          ts,
          "completed",
          ctx.receiptType,
          ctx.transactionType,
          ctx.sdcReceiptCode,
          0,
          rest.method,
          rest.methodLabel,
          roundUsd(rest.totalUSD),
          usdToCdf(rest.totalUSD, rest.exchangeRate),
          roundUsd(rest.changeDueUSD ?? 0),
          roundCdf(rest.changeDueCDF ?? rest.changePrimary ?? 0),
          roundUsd(rest.amountReceived),
          rest.amountReceivedPrimary != null ? roundCdf(rest.amountReceivedPrimary) : null,
          rest.reference ?? null,
          rest.cardLastFour ?? null,
          rest.cashierId,
          rest.cashierName,
          rest.customerId ?? null,
          rest.customerName ?? null,
          rest.customerPhone ?? null,
          rest.customerAddress ?? null,
          rest.customerEmail ?? null,
          rest.customerTaxNumber ?? null,
          rest.exchangeRate,
          roundUsd(rest.promotionDiscountUSD ?? 0),
          roundUsd(rest.manualDiscountUSD ?? 0),
          rest.appliedPromotionId ?? null,
          merchantCode,
          ts,
          SYNC_STATUS.PENDING,
        ]
      );

      for (const it of items ?? []) {
        await dbExecute(
        db,
          `INSERT INTO sale_items (id, sale_id, product_id, name, lot_number, expiration_date, price, qty, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newEntityId("line"),
            id,
            it.productId,
            it.name,
            it.lotNumber ?? null,
            it.expirationDate ?? null,
            it.price,
            it.qty,
            ts,
            SYNC_STATUS.PENDING,
          ]
        );
      }

      await persistSettingsForMerchant(db, merchantCode, {
        exchangeRate: settings.exchangeRate,
        expiryAlertDays: settings.expiryAlertDays,
        trainingMode: settings.trainingMode,
        legalAcceptance: settings.legalAcceptance,
        invoiceProfile: settings.invoiceProfile,
        invoiceCounter: settings.invoiceCounter,
      });
      await refreshSqlite(db);
      const fresh = await loadSales(db, merchantCode);
      const found = fresh.find((s) => s.id === id);
      if (found) return found;
      return rowToSale(
        {
          id,
          invoice_number: invoiceNumber,
          timestamp: ts,
          status: "completed",
          receipt_type: ctx.receiptType,
          transaction_type: ctx.transactionType,
          sdc_receipt_code: ctx.sdcReceiptCode,
          copy_index: 0,
          method: rest.method,
          method_label: rest.methodLabel,
          total_usd: roundUsd(rest.totalUSD),
          total_cdf: usdToCdf(rest.totalUSD, rest.exchangeRate),
          change_due_usd: roundUsd(rest.changeDueUSD ?? 0),
          change_due_cdf: roundCdf(rest.changeDueCDF ?? rest.changePrimary ?? 0),
          amount_received: roundUsd(rest.amountReceived),
          amount_received_primary:
            rest.amountReceivedPrimary != null ? roundCdf(rest.amountReceivedPrimary) : null,
          reference: rest.reference,
          card_last_four: rest.cardLastFour,
          cashier_id: rest.cashierId,
          cashier_name: rest.cashierName,
          customer_id: rest.customerId ?? null,
          customer_name: rest.customerName ?? null,
          customer_phone: rest.customerPhone ?? null,
          customer_address: rest.customerAddress ?? null,
          customer_email: rest.customerEmail ?? null,
          customer_tax_number: rest.customerTaxNumber ?? null,
          exchange_rate: rest.exchangeRate,
          refund_at: null,
          refund_reason: null,
          refund_restore_stock: 0,
          refund_by_user_id: null,
          refund_by_user_name: null,
          updated_at: ts,
          sync_status: SYNC_STATUS.PENDING,
        },
        (items ?? []).map((it) => ({
          id: newEntityId("line"),
          product_id: it.productId,
          name: it.name,
          lot_number: it.lotNumber,
          expiration_date: it.expirationDate,
          price: it.price,
          qty: it.qty,
        }))
      );
    },
    recordPurchase: async (payload) => {
      const supplierValidated = validateSupplierFields(payload.supplier ?? {}, lang());
      if (!supplierValidated.ok) return supplierValidated;
      const itemValidated = validatePurchaseItems(payload.items, sqlite.products, lang());
      if (!itemValidated.ok) return itemValidated;

      const db = await getDatabase();
      const { merchantCode } = await getActiveTenant(db);
      const ts = nowIso();
      const existingSupplier = findMatchingSupplier(sqlite.suppliers, supplierValidated.data);
      const supplierId = existingSupplier?.id ?? newEntityId("sup");
      const purchaseId = newEntityId("pur");
      const workingProducts = [...sqlite.products];
      const resolvedItems = [];

      for (const item of itemValidated.items) {
        const batchResolution = resolveBatchTarget(
          workingProducts,
          item.productId,
          item.lotNumber,
          item.expirationDate
        );
        if (!batchResolution.ok) return batchResolution;

        if (batchResolution.targetProduct) {
          const targetIndex = workingProducts.findIndex(
            (product) => product.id === batchResolution.targetProduct.id
          );
          const target = workingProducts[targetIndex];
          workingProducts[targetIndex] = {
            ...target,
            stock: (target.stock ?? 0) + item.qty,
            updatedAt: ts,
            syncStatus: SYNC_STATUS.PENDING,
          };
          resolvedItems.push({
            ...item,
            productId: target.id,
            productName: target.name,
            lotNumber: batchResolution.lotNumber,
            expirationDate: batchResolution.expirationDate,
          });
        } else {
          const source = batchResolution.sourceProduct;
          const newBatch = {
            ...source,
            id: newEntityId("prd"),
            stock: item.qty,
            lotNumber: batchResolution.lotNumber,
            expirationDate: batchResolution.expirationDate,
            updatedAt: ts,
            syncStatus: SYNC_STATUS.PENDING,
          };
          workingProducts.push(newBatch);
          resolvedItems.push({
            ...item,
            productId: newBatch.id,
            productName: newBatch.name,
            lotNumber: newBatch.lotNumber,
            expirationDate: newBatch.expirationDate,
          });
        }
      }

      const totalCost = resolvedItems.reduce((sum, item) => sum + item.lineTotal, 0);

      await dbExecute(
        db,
        `INSERT INTO suppliers (id, name, phone, address, merchant_code, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           phone = excluded.phone,
           address = excluded.address,
           merchant_code = excluded.merchant_code,
           updated_at = excluded.updated_at,
           sync_status = excluded.sync_status`,
        [
          supplierId,
          supplierValidated.data.name,
          supplierValidated.data.phone,
          supplierValidated.data.address,
          merchantCode,
          ts,
          SYNC_STATUS.PENDING,
        ]
      );

      await dbExecute(
        db,
        `INSERT INTO purchase_orders (
          id, supplier_id, supplier_name, supplier_phone, supplier_address,
          reference, notes, total_cost, timestamp, created_by_user_id, created_by_user_name,
          merchant_code, updated_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchaseId,
          supplierId,
          supplierValidated.data.name,
          supplierValidated.data.phone,
          supplierValidated.data.address,
          String(payload.reference ?? "").trim() || null,
          String(payload.notes ?? "").trim() || null,
          totalCost,
          ts,
          payload.createdByUserId ?? null,
          payload.createdByUserName ?? null,
          merchantCode,
          ts,
          SYNC_STATUS.PENDING,
        ]
      );

      for (const item of resolvedItems) {
        await dbExecute(
          db,
          `INSERT INTO purchase_items (
            id, purchase_id, product_id, product_name, lot_number, expiration_date,
            unit_cost, qty, line_total, updated_at, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newEntityId("pit"),
            purchaseId,
            item.productId,
            item.productName,
            item.lotNumber,
            item.expirationDate,
            item.unitCost,
            item.qty,
            item.lineTotal,
            ts,
            SYNC_STATUS.PENDING,
          ]
        );
      }

      const originalProductsById = new Map(sqlite.products.map((product) => [product.id, product]));
      for (const product of workingProducts) {
        const original = originalProductsById.get(product.id);
        if (original) {
          if (
            original.stock === product.stock &&
            original.lotNumber === product.lotNumber &&
            original.expirationDate === product.expirationDate
          ) {
            continue;
          }
        await dbExecute(
          db,
          `UPDATE products
           SET stock = ?, lot_number = ?, expiration_date = ?, updated_at = ?, sync_status = ?
           WHERE id = ?`,
            [
              product.stockQuantityItems ?? product.stock,
              product.lotNumber,
              product.expirationDate,
              ts,
              SYNC_STATUS.PENDING,
              product.id,
            ]
          );
          await upsertInventoryBreakdown(
            db,
            product.id,
            product,
            ts,
            SYNC_STATUS.PENDING
          );
          continue;
        }

        await dbExecute(
          db,
          `INSERT INTO products (id, name, lot_number, expiration_date, price, stock, category_id, merchant_code, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            product.id,
            product.name,
            product.lotNumber,
            product.expirationDate,
            product.price,
            product.stockQuantityItems ?? product.stock,
            product.categoryId ?? null,
            merchantCode,
            product.updatedAt,
            product.syncStatus,
          ]
        );
        await upsertInventoryBreakdown(
          db,
          product.id,
          product,
          ts,
          product.syncStatus ?? SYNC_STATUS.PENDING
        );
      }

      await refreshWithSnapshots(db);
      const fresh = await loadPurchases(db, merchantCode);
      return { ok: true, purchase: fresh.find((purchase) => purchase.id === purchaseId) ?? null };
    },
    refundSale: async (saleId, { reason, restoreStock, byUserId, byUserName }) => {
      const db = await getDatabase();
      const sale = sqlite.sales.find((s) => s.id === saleId);
      if (!sale) return { ok: false, error: "Invoice not found." };
      if (sale.status === "refunded") return { ok: false, error: "This invoice was already refunded." };
      const ts = nowIso();
      await dbExecute(
        db,
        `UPDATE sales SET status = 'refunded', refund_at = ?, refund_reason = ?, refund_restore_stock = ?,
         refund_by_user_id = ?, refund_by_user_name = ?, updated_at = ?, sync_status = ?
         WHERE id = ?`,
        [
          ts,
          (reason && reason.trim()) || "—",
          restoreStock ? 1 : 0,
          byUserId,
          byUserName,
          ts,
          SYNC_STATUS.PENDING,
          saleId,
        ]
      );
      await refreshSqlite(db);
      return { ok: true, sale: { ...sale, status: "refunded" } };
    },
    incrementCopyIndex: async (saleId) => {
      const db = await getDatabase();
      const ts = nowIso();
      await dbExecute(
        db,
        `UPDATE sales SET copy_index = copy_index + 1, updated_at = ?, sync_status = ? WHERE id = ?`,
        [ts, SYNC_STATUS.PENDING, saleId]
      );
      const { merchantCode } = await getActiveTenant(db);
      await refreshSqlite(db);
      const fresh = await loadSales(db, merchantCode);
      return fresh.find((s) => s.id === saleId) ?? null;
    },
    updateSaleNotes: async (saleId, notes) => {
      const db = await getDatabase();
      const ts = nowIso();
      const trimmed = String(notes ?? "").trim() || null;
      await dbExecute(
        db,
        `UPDATE sales SET notes = ?, updated_at = ?, sync_status = ? WHERE id = ?`,
        [trimmed, ts, SYNC_STATUS.PENDING, saleId]
      );
      const { merchantCode } = await getActiveTenant(db);
      await refreshSqlite(db);
      const fresh = await loadSales(db, merchantCode);
      return fresh.find((s) => s.id === saleId) ?? null;
    },
    addProduct: async (fields) => {
      const validated = validateProductFields(fields, lang());
      if (!validated.ok) return validated;
      const db = await getDatabase();
      const { merchantCode } = await getActiveTenant(db);
      const ts = nowIso();
      const id = newEntityId("prd");
      const categoryId = String(fields.categoryId ?? fields.category_id ?? "").trim() || null;
      await dbExecute(
        db,
        `INSERT INTO products (id, name, lot_number, expiration_date, price, stock, category_id, merchant_code, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          validated.data.name,
          validated.data.lotNumber,
          validated.data.expirationDate,
          validated.data.price,
          validated.data.stockQuantityItems,
          categoryId,
          merchantCode,
          ts,
          SYNC_STATUS.PENDING,
        ]
      );
      await upsertInventoryBreakdown(db, id, validated.data, ts, SYNC_STATUS.PENDING);
      await refreshWithSnapshots(db);
      return { ok: true };
    },
    updateProduct: async (id, fields) => {
      const validated = validateProductFields(fields, lang());
      if (!validated.ok) return validated;
      const db = await getDatabase();
      const ts = nowIso();
      const categoryId = String(fields.categoryId ?? fields.category_id ?? "").trim() || null;
      await dbExecute(
        db,
        `UPDATE products SET name = ?, lot_number = ?, expiration_date = ?, price = ?, stock = ?,
         category_id = ?, updated_at = ?, sync_status = ? WHERE id = ?`,
        [
          validated.data.name,
          validated.data.lotNumber,
          validated.data.expirationDate,
          validated.data.price,
          validated.data.stockQuantityItems,
          categoryId,
          ts,
          SYNC_STATUS.PENDING,
          id,
        ]
      );
      await upsertInventoryBreakdown(db, id, validated.data, ts, SYNC_STATUS.PENDING);
      await refreshWithSnapshots(db);
      return { ok: true };
    },
    deleteProduct: async (id) => {
      const db = await getDatabase();
      await dbExecute(
        db,`DELETE FROM products WHERE id = ?`, [id]);
      await refreshWithSnapshots(db);
      return { ok: true };
    },
    importProducts: async (rows) => {
      if (!Array.isArray(rows) || rows.length === 0) {
        return { ok: false, error: appError("csvNoRows", lang()) };
      }

      const db = await getDatabase();
      const { merchantCode } = await getActiveTenant(db);
      const ts = nowIso();
      const workingProducts = [...sqlite.products];
      let created = 0;
      let updated = 0;

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const validated = validateProductFields({
          name: row.name,
          lotNumber: row.lot_number,
          expirationDate: row.expiration_date,
          price: row.price,
          stock: row.stock,
          stockQuantityItems: row.stock,
          buyUnit: row.buy_unit,
          buyUnitCost: row.buy_unit_cost,
          qtyPerUnit: row.qty_per_unit,
          itemSizeLabel: row.item_size_label,
          reorderLevelItems: row.reorder_level_items,
        }, lang());
        if (!validated.ok) {
          return { ok: false, error: appError("csvRow", lang(), { row: i + 2, message: validated.error }) };
        }

        const requestedId = row.id?.trim() || null;
        const existingById = requestedId
          ? workingProducts.find((product) => product.id === requestedId) ?? null
          : null;
        const matchingBatch = findMatchingProductBatch(workingProducts, validated.data);
        const target = existingById && isSameProductBatch(existingById, validated.data)
          ? existingById
          : matchingBatch;

        if (target) {
          const mergedStock = (target.stockQuantityItems ?? target.stock ?? 0) + validated.data.stockQuantityItems;
          await dbExecute(
            db,
            `UPDATE products
             SET name = ?, lot_number = ?, expiration_date = ?, price = ?, stock = ?, updated_at = ?, sync_status = ?
             WHERE id = ?`,
            [
              validated.data.name,
              validated.data.lotNumber,
              validated.data.expirationDate,
              validated.data.price,
              mergedStock,
              ts,
              SYNC_STATUS.PENDING,
              target.id,
            ]
          );
          await upsertInventoryBreakdown(
            db,
            target.id,
            { ...target, ...validated.data, stockQuantityItems: mergedStock },
            ts,
            SYNC_STATUS.PENDING
          );
          const targetIndex = workingProducts.findIndex((product) => product.id === target.id);
          workingProducts[targetIndex] = {
            ...target,
            ...validated.data,
            stock: mergedStock,
            stockQuantityItems: mergedStock,
            updatedAt: ts,
            syncStatus: SYNC_STATUS.PENDING,
          };
          updated += 1;
        } else {
          const id = requestedId && !existingById ? requestedId : newEntityId("prd");
          await dbExecute(
            db,
            `INSERT INTO products (id, name, lot_number, expiration_date, price, stock, category_id, merchant_code, updated_at, sync_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              validated.data.name,
              validated.data.lotNumber,
              validated.data.expirationDate,
              validated.data.price,
              validated.data.stockQuantityItems,
              row.category_id ?? null,
              merchantCode,
              ts,
              SYNC_STATUS.PENDING,
            ]
          );
          await upsertInventoryBreakdown(db, id, validated.data, ts, SYNC_STATUS.PENDING);
          workingProducts.push({
            id,
            ...validated.data,
            updatedAt: ts,
            syncStatus: SYNC_STATUS.PENDING,
          });
          created += 1;
        }
      }

      await refreshWithSnapshots(db);
      return { ok: true, created, updated, count: rows.length };
    },
    restockProduct: async (id, amount, lotNumber, expirationDate) => {
      const r = restockLogic(
        { products: sqlite.products, setProducts: null },
        id,
        amount,
        lotNumber,
        expirationDate,
        lang()
      );
      if (!r.ok) return r;
      const db = await getDatabase();
      const { merchantCode } = await getActiveTenant(db);
      const ts = nowIso();
      if (r.createNew) {
        const sourceProduct = sqlite.products.find((product) => product.id === id);
        await dbExecute(
          db,
          `INSERT INTO products (id, name, lot_number, expiration_date, price, stock, category_id, merchant_code, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.targetId,
            r.name,
            r.lotNumber,
            r.expirationDate,
            r.price,
            r.stock,
            sourceProduct?.categoryId ?? null,
            merchantCode,
            ts,
            SYNC_STATUS.PENDING,
          ]
        );
      } else {
        await dbExecute(
          db,
          `UPDATE products
           SET stock = ?, updated_at = ?, sync_status = ?
           WHERE id = ?`,
          [r.stock, ts, SYNC_STATUS.PENDING, r.targetId]
        );
      }
      await upsertInventoryBreakdown(
        db,
        r.targetId,
        { stockQuantityItems: r.stock },
        ts,
        SYNC_STATUS.PENDING
      );
      await refreshWithSnapshots(db);
      return { ok: true };
    },
    decrementStockForSale: async (saleItems) => {
      const db = await getDatabase();
      const ts = nowIso();
      for (const line of saleItems) {
        if (!line.productId) continue;
        await adjustStockQuantityItems(db, line.productId, -Math.abs(line.qty), ts);
      }
      await refreshWithSnapshots(db);
    },
    restoreStockForRefund: async (saleItems) => {
      if (!saleItems?.length) return;
      const db = await getDatabase();
      const ts = nowIso();
      for (const line of saleItems) {
        if (!line.productId) continue;
        await adjustStockQuantityItems(db, line.productId, Math.abs(line.qty), ts);
      }
      await refreshWithSnapshots(db);
    },
    updateExchangeRate: async (rate) => {
      const parsed = parseFloat(rate);
      if (Number.isNaN(parsed) || parsed <= 0) return { ok: false, error: "Enter a valid exchange rate." };
      await persistSettings({ ...settings, exchangeRate: parsed });
      return { ok: true };
    },
    updateExpiryAlertDays: async (days) => {
      const parsed = parseInt(days, 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 365) {
        return { ok: false, error: "Alert window must be between 1 and 365 days." };
      }
      await persistSettings({ ...settings, expiryAlertDays: parsed });
      return { ok: true };
    },
    updateInvoiceProfile: async (partial) => {
      await persistSettings({
        ...settings,
        invoiceProfile: { ...DEFAULT_INVOICE_PROFILE, ...settings.invoiceProfile, ...partial },
      });
      return { ok: true };
    },
    saveAllSettings: async ({
      exchangeRate,
      primaryCurrency,
      language,
      expiryAlertDays,
      invoiceProfile,
      trainingMode,
    }) => {
      const parsedRate = parseFloat(exchangeRate);
      if (Number.isNaN(parsedRate) || parsedRate <= 0) {
        return { ok: false, error: "Enter a valid exchange rate." };
      }

      const parsedDays = parseInt(expiryAlertDays, 10);
      if (Number.isNaN(parsedDays) || parsedDays < 1 || parsedDays > 365) {
        return { ok: false, error: "Alert window must be between 1 and 365 days." };
      }

      await persistSettings({
        ...settings,
        exchangeRate: parsedRate,
        primaryCurrency: normalizePrimaryCurrency(primaryCurrency),
        language: language !== undefined ? normalizeLocale(language) : settings.language,
        expiryAlertDays: parsedDays,
        invoiceProfile: {
          ...DEFAULT_INVOICE_PROFILE,
          ...settings.invoiceProfile,
          ...invoiceProfile,
        },
        trainingMode: !!trainingMode,
      });
      return { ok: true };
    },
    savePortalConnection: async ({ apiBaseUrl, apiToken }) => {
      const trimmedUrl = String(apiBaseUrl ?? "").trim();
      const trimmedToken = String(apiToken ?? "").trim();
      if (!trimmedUrl) {
        return { ok: false, error: "Enter the portal API URL." };
      }
      if (!trimmedToken) {
        return { ok: false, error: "Enter the portal API token." };
      }
      const db = await getDatabase();
      const tenant = await getActiveTenant(db);
      const base = scrubCloudSyncForTenant(await loadCloudSync(db), tenant.merchantCode);
      await persistCloudSyncConfig(db, {
        ...base,
        apiBaseUrl: trimmedUrl,
        apiToken: trimmedToken,
      });
      await refreshSqlite(db);
      return { ok: true };
    },
    syncDeviceBindingFromPortal: async (deviceBinding, { apiBaseUrl, apiToken, operatorMerchantCode }) => {
      const fields = deviceBindingToCloudFields(deviceBinding);
      if (!fields) {
        return { ok: false, error: deviceBinding?.reason ?? "Device binding is not valid." };
      }
      const db = await getDatabase();
      const tenant = await getActiveTenant(db);
      const operatorMerchant = String(operatorMerchantCode ?? tenant.merchantCode ?? "").trim();
      if (operatorMerchant && fields.merchantCode && fields.merchantCode !== operatorMerchant) {
        return {
          ok: false,
          error: `Device lease is for "${fields.merchantCode}" but you signed in as "${operatorMerchant}".`,
        };
      }
      const cloud = await loadCloudSync(db);
      await persistCloudSyncConfig(
        db,
        normalizeCloudSync({
          ...cloud,
          ...fields,
          apiBaseUrl: String(apiBaseUrl ?? cloud.apiBaseUrl ?? "").trim(),
          apiToken: String(apiToken ?? cloud.apiToken ?? "").trim(),
        })
      );
      await refreshSqlite(db);
      return { ok: true };
    },
    getDeviceActivation: async () => {
      const db = await getDatabase();
      const cloud = await loadCloudSync(db);
      return {
        merchantCode: String(cloud.merchantCode ?? "").trim(),
        branchCode: String(cloud.branchCode ?? "").trim(),
        leaseToken: String(cloud.leaseToken ?? "").trim(),
      };
    },
    saveCloudSyncConfig: async ({ apiBaseUrl, apiToken, enabled, merchantCode, branchCode, deviceCode }) => {
      const trimmedUrl = String(apiBaseUrl ?? "").trim();
      if (enabled && !trimmedUrl) {
        return { ok: false, error: "Enter the cloud API URL before enabling sync." };
      }
      const trimmedMerchantCode = String(merchantCode ?? "").trim();
      const trimmedBranchCode = String(branchCode ?? "").trim();
      const trimmedDeviceCode = String(deviceCode ?? "").trim();
      if (enabled && !trimmedMerchantCode) {
        return { ok: false, error: "Enter the merchant code from the portal." };
      }
      const db = await getDatabase();
      const tenant = await getActiveTenant(db);
      if (trimmedMerchantCode && trimmedMerchantCode !== tenant.merchantCode) {
        return {
          ok: false,
          error: `Cloud settings must use merchant "${tenant.merchantCode}" for your current session.`,
        };
      }
      const base = scrubCloudSyncForTenant(await loadCloudSync(db), tenant.merchantCode);
      await persistCloudSyncConfig(db, {
        ...base,
        apiBaseUrl: trimmedUrl,
        apiToken: String(apiToken ?? ""),
        merchantCode: tenant.merchantCode,
        branchCode: trimmedBranchCode,
        deviceCode: trimmedDeviceCode,
        enabled: !!enabled,
      });
      await refreshSqlite(db);
      return { ok: true };
    },
    activateCloudDevice: async ({ activationCode, deviceLabel, validDays }) => {
      const db = await getDatabase();
      const tenant = await getActiveTenant(db);
      const config = normalizeCloudSync(scrubCloudSyncForTenant(sqlite.cloudSync, tenant.merchantCode));
      if (!config.apiBaseUrl) {
        return { ok: false, error: "Set the cloud API URL first." };
      }
      if (!config.apiToken) {
        return { ok: false, error: "Set the cloud API bearer token first." };
      }
      const trimmedActivationCode = String(activationCode ?? "").trim();
      const trimmedDeviceLabel = String(deviceLabel ?? "").trim();
      if (!trimmedActivationCode) {
        return { ok: false, error: "Enter the activation code from the portal." };
      }
      if (!trimmedDeviceLabel) {
        return { ok: false, error: "Enter a device label for this desktop." };
      }

      const alignedDevice =
        config.deviceCode && config.merchantCode === tenant.merchantCode ? config.deviceCode : "";
      try {
        const result = await activateDeviceOnCloud(
          config.apiBaseUrl,
          {
            activationCode: trimmedActivationCode,
            deviceLabel: trimmedDeviceLabel,
            ...(alignedDevice ? { deviceCode: alignedDevice } : {}),
            validDays,
          },
          { apiToken: config.apiToken }
        );

        const nextConfig = {
          ...emptyTenantCloudBinding(config, result.merchantCode, result.branchCode),
          apiBaseUrl: config.apiBaseUrl,
          apiToken: config.apiToken,
          enabled: true,
          merchantCode: result.merchantCode,
          branchCode: result.branchCode,
          deviceCode: result.device?.deviceCode ?? "",
          deviceLabel: result.device?.label ?? trimmedDeviceLabel,
          ...cloudSyncActivationState({
            activationCode: trimmedActivationCode,
            device: result.device,
            lease: result.lease,
          }),
        };
        await persistCloudSyncConfig(db, nextConfig);
        await setActiveTenant(db, {
          merchantCode: result.merchantCode,
          branchCode: result.branchCode,
        });
        await refreshSqlite(db);
        return { ok: true, activation: result };
      } catch (error) {
        return { ok: false, error: error?.message ?? String(error) };
      }
    },
    refreshCloudLeaseStatus,
    saveProductCategory: async (fields) => {
      const db = await getDatabase();
      const { merchantCode } = await getActiveTenant(db);
      const category = await upsertProductCategory(db, merchantCode, {
        id: fields.id ?? newEntityId("cat"),
        name: fields.name,
        code: fields.code,
        syncStatus: SYNC_STATUS.PENDING,
      });
      await refreshSqlite(db);
      return { ok: true, category };
    },
    savePromotion: async (fields) => {
      const db = await getDatabase();
      const { merchantCode } = await getActiveTenant(db);
      const promotion = await upsertPromotion(db, merchantCode, {
        ...fields,
        id: fields.id ?? newEntityId("prm"),
        syncStatus: SYNC_STATUS.PENDING,
      });
      await refreshSqlite(db);
      return { ok: true, promotion };
    },
    deletePromotion: async (id) => {
      const db = await getDatabase();
      await deletePromotionRow(db, id);
      await refreshSqlite(db);
      return { ok: true };
    },
    pushPendingSync,
    productImportColumns: PRODUCT_IMPORT_COLUMNS,
    exportBackupData: async () => {
      const db = await getDatabase();
      const exportedAt = nowIso();
      await upsertMeta(db, LAST_BACKUP_EXPORT_AT_KEY, exportedAt);
      await refreshSqlite(db);
      const rawSettings = await loadRawSettings(db);
      return {
        products: sqlite.products,
        customers: sqlite.customers,
        suppliers: sqlite.suppliers,
        sales: sqlite.sales,
        purchases: sqlite.purchases,
        stockSnapshots: sqlite.stockSnapshots,
        productCategories: sqlite.productCategories,
        promotions: sqlite.promotions,
        settings: settingsForBackupExport(rawSettings),
      };
    },
    restoreBackupData: async (data) => {
      const db = await getDatabase();
      const ts = nowIso();

      await runSchemaMigrations(db);

      for (const sql of [
        "DELETE FROM purchase_items",
        "DELETE FROM purchase_orders",
        "DELETE FROM sale_items",
        "DELETE FROM sales",
        "DELETE FROM promotions",
        "DELETE FROM product_categories",
        "DELETE FROM inventory_breakdown",
        "DELETE FROM products",
        "DELETE FROM customers",
        "DELETE FROM suppliers",
        "DELETE FROM stock_snapshots",
        "DELETE FROM settings",
      ]) {
        await dbExecute(db, sql);
      }

      const activeTenant = await getActiveTenant(db);
      await saveSettings(
        db,
        settingsFromBackupImport(data.settings, activeTenant.merchantCode)
      );

      for (const category of data.productCategories ?? []) {
        await upsertProductCategory(db, activeTenant.merchantCode, {
          id: category.id ?? newEntityId("cat"),
          name: category.name,
          code: category.code,
          updatedAt: category.updatedAt ?? ts,
          syncStatus: category.syncStatus ?? SYNC_STATUS.PENDING,
        });
      }

      for (const promotion of data.promotions ?? []) {
        await upsertPromotion(db, activeTenant.merchantCode, {
          ...promotion,
          id: promotion.id ?? newEntityId("prm"),
          updatedAt: promotion.updatedAt ?? ts,
          syncStatus: promotion.syncStatus ?? SYNC_STATUS.PENDING,
        });
      }

      for (const product of data.products ?? []) {
        const productId = product.id ?? newEntityId("prd");
        await dbExecute(
          db,
          `INSERT INTO products (id, name, lot_number, expiration_date, price, stock, category_id, merchant_code, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            productId,
            product.name,
            product.lotNumber ?? null,
            product.expirationDate ?? null,
            product.price ?? 0,
            product.stock ?? product.stockQuantityItems ?? 0,
            product.categoryId ?? null,
            activeTenant.merchantCode,
            product.updatedAt ?? ts,
            product.syncStatus ?? SYNC_STATUS.PENDING,
          ]
        );
        await upsertInventoryBreakdown(
          db,
          productId,
          product,
          product.updatedAt ?? ts,
          product.syncStatus ?? SYNC_STATUS.PENDING
        );
      }

      for (const customer of data.customers ?? []) {
        await dbExecute(
          db,
          `INSERT INTO customers (id, name, phone, address, email, tax_number, client_tier, merchant_code, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            customer.id ?? newEntityId("cus"),
            customer.name,
            customer.phone ?? null,
            customer.address ?? null,
            customer.email ?? null,
            customer.taxNumber ?? null,
            customer.clientTier ?? null,
            activeTenant.merchantCode,
            customer.updatedAt ?? ts,
            customer.syncStatus ?? SYNC_STATUS.PENDING,
          ]
        );
      }

      for (const supplier of data.suppliers ?? []) {
        await dbExecute(
          db,
          `INSERT INTO suppliers (id, name, phone, address, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            supplier.id ?? newEntityId("sup"),
            supplier.name,
            supplier.phone ?? null,
            supplier.address ?? null,
            supplier.updatedAt ?? ts,
            supplier.syncStatus ?? SYNC_STATUS.PENDING,
          ]
        );
      }

      for (const sale of data.sales ?? []) {
        await dbExecute(
          db,
          `INSERT INTO sales (
            id, invoice_number, timestamp, status, receipt_type, transaction_type, sdc_receipt_code,
            copy_index, method, method_label, total_usd, total_cdf, change_due_usd, change_due_cdf,
            amount_received, amount_received_primary, reference, card_last_four, cashier_id, cashier_name,
            customer_id, customer_name, customer_phone, customer_address, customer_email, customer_tax_number,
            exchange_rate, promotion_discount_usd, manual_discount_usd, applied_promotion_id, merchant_code,
            refund_at, refund_reason, refund_restore_stock, refund_by_user_id, refund_by_user_name, updated_at, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sale.id ?? newEntityId("inv"),
            sale.invoiceNumber ?? sale.id,
            sale.timestamp ?? ts,
            sale.status ?? "completed",
            sale.receiptType ?? "NORMAL",
            sale.transactionType ?? "SALES",
            sale.sdcReceiptCode ?? "RT_NORMAL_SALES",
            sale.copyIndex ?? 0,
            sale.method ?? null,
            sale.methodLabel ?? null,
            roundUsd(sale.totalUSD ?? 0),
            usdToCdf(sale.totalUSD ?? 0, sale.exchangeRate),
            roundUsd(sale.changeDueUSD ?? 0),
            roundCdf(sale.changeDueCDF ?? sale.changePrimary ?? 0),
            roundUsd(sale.amountReceived),
            sale.amountReceivedPrimary != null ? roundCdf(sale.amountReceivedPrimary) : null,
            sale.reference ?? null,
            sale.cardLastFour ?? null,
            sale.cashierId ?? null,
            sale.cashierName ?? null,
            sale.customerId ?? null,
            sale.customerName ?? null,
            sale.customerPhone ?? null,
            sale.customerAddress ?? null,
            sale.customerEmail ?? null,
            sale.customerTaxNumber ?? null,
            sale.exchangeRate ?? null,
            sale.promotionDiscountUSD ?? 0,
            sale.manualDiscountUSD ?? 0,
            sale.appliedPromotionId ?? null,
            activeTenant.merchantCode,
            sale.refund?.at ?? null,
            sale.refund?.reason ?? null,
            sale.refund?.restoreStock ? 1 : 0,
            sale.refund?.byUserId ?? null,
            sale.refund?.byUserName ?? null,
            sale.updatedAt ?? ts,
            sale.syncStatus ?? SYNC_STATUS.PENDING,
          ]
        );

        for (const item of sale.items ?? []) {
          await dbExecute(
            db,
            `INSERT INTO sale_items (
              id, sale_id, product_id, name, lot_number, expiration_date, price, qty, updated_at, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id ?? newEntityId("line"),
              sale.id ?? newEntityId("inv"),
              item.productId ?? null,
              item.name,
              item.lotNumber ?? null,
              item.expirationDate ?? null,
              item.price ?? 0,
              item.qty ?? 0,
              sale.updatedAt ?? ts,
              sale.syncStatus ?? SYNC_STATUS.PENDING,
            ]
          );
        }
      }

      for (const purchase of data.purchases ?? []) {
        const purchaseId = purchase.id ?? newEntityId("pur");
        await dbExecute(
          db,
          `INSERT INTO purchase_orders (
            id, supplier_id, supplier_name, supplier_phone, supplier_address,
            reference, notes, total_cost, timestamp, created_by_user_id, created_by_user_name,
            updated_at, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            purchaseId,
            purchase.supplierId ?? null,
            purchase.supplierName ?? "Unknown supplier",
            purchase.supplierPhone ?? null,
            purchase.supplierAddress ?? null,
            purchase.reference ?? null,
            purchase.notes ?? null,
            purchase.totalCost ?? 0,
            purchase.timestamp ?? ts,
            purchase.createdByUserId ?? null,
            purchase.createdByUserName ?? null,
            purchase.updatedAt ?? ts,
            purchase.syncStatus ?? SYNC_STATUS.PENDING,
          ]
        );

        for (const item of purchase.items ?? []) {
          await dbExecute(
            db,
            `INSERT INTO purchase_items (
              id, purchase_id, product_id, product_name, lot_number, expiration_date,
              unit_cost, qty, line_total, updated_at, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id ?? newEntityId("pit"),
              purchaseId,
              item.productId ?? null,
              item.productName ?? "Unnamed product",
              item.lotNumber ?? null,
              item.expirationDate ?? null,
              item.unitCost ?? 0,
              item.qty ?? 0,
              item.lineTotal ?? (item.unitCost ?? 0) * (item.qty ?? 0),
              purchase.updatedAt ?? ts,
              purchase.syncStatus ?? SYNC_STATUS.PENDING,
            ]
          );
        }
      }

      for (const snapshot of data.stockSnapshots ?? []) {
        await dbExecute(
          db,
          `INSERT INTO stock_snapshots (
            id, snapshot_date, snapshot_month, product_id, product_name, lot_number,
            expiration_date, price, stock, stock_value, updated_at, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            snapshot.id ?? newEntityId("snap"),
            snapshot.snapshotDate,
            snapshot.snapshotMonth ??
              String(snapshot.snapshotDate ?? "").slice(0, 7),
            snapshot.productId,
            snapshot.productName,
            snapshot.lotNumber ?? null,
            snapshot.expirationDate ?? null,
            snapshot.price ?? 0,
            snapshot.stock ?? 0,
            snapshot.stockValue ?? (snapshot.price ?? 0) * (snapshot.stock ?? 0),
            snapshot.updatedAt ?? ts,
            snapshot.syncStatus ?? SYNC_STATUS.PENDING,
          ]
        );
      }

      await upsertMeta(db, "ls_migrated", "1");
      await upsertMeta(db, "demo_products_removed", "1");
      await upsertMeta(db, LAST_BACKUP_RESTORE_AT_KEY, nowIso());
      await refreshSqlite(db);
      return { ok: true };
    },
    listPendingSync: async () => {
      const db = await getDatabase();
      const { merchantCode } = await getActiveTenant(db);
      const [products, customers, suppliers, sales, purchases, settingsRows] = await Promise.all([
        dbSelect(db, "SELECT id, sync_status FROM products WHERE sync_status != 'SYNCED' AND merchant_code = ?", [
          merchantCode,
        ]),
        dbSelect(db, "SELECT id, sync_status FROM customers WHERE sync_status != 'SYNCED' AND merchant_code = ?", [
          merchantCode,
        ]),
        dbSelect(db, "SELECT id, sync_status FROM suppliers WHERE sync_status != 'SYNCED' AND merchant_code = ?", [
          merchantCode,
        ]),
        dbSelect(db, "SELECT id, sync_status FROM sales WHERE sync_status != 'SYNCED' AND merchant_code = ?", [
          merchantCode,
        ]),
        dbSelect(
          db,
          "SELECT id, sync_status FROM purchase_orders WHERE sync_status != 'SYNCED' AND merchant_code = ?",
          [merchantCode]
        ),
        dbSelect(db, "SELECT key, sync_status FROM settings WHERE sync_status != 'SYNCED'"),
      ]);
      const [stockSnapshots, productCategories, promotions] = await Promise.all([
        dbSelect(
          db,
          "SELECT id, sync_status FROM stock_snapshots WHERE sync_status != 'SYNCED' AND merchant_code = ?",
          [merchantCode]
        ),
        dbSelect(
          db,
          "SELECT id, sync_status FROM product_categories WHERE sync_status != 'SYNCED' AND merchant_code = ?",
          [merchantCode]
        ),
        dbSelect(
          db,
          "SELECT id, sync_status FROM promotions WHERE sync_status != 'SYNCED' AND merchant_code = ?",
          [merchantCode]
        ),
      ]);
      return {
        products,
        customers,
        suppliers,
        sales,
        purchases,
        settings: settingsRows,
        stockSnapshots,
        productCategories,
        promotions,
      };
    },
    licenseAccepted:
      isLicenseAcceptedInSettings(settings) || !!readLocalLicenseAcceptance(),
    acceptLicenseAgreement: async (locale) => {
      const legalAcceptance = licenseAcceptanceForSettings();
      await persistSettings({
        ...settings,
        legalAcceptance,
        language: locale !== undefined ? normalizeLocale(locale) : settings.language ?? DEFAULT_LOCALE,
      });
      saveLocalLicenseAcceptance();
      return { ok: true, legalAcceptance };
    },
  };
}

function restockLogic(f, id, amount, lotNumber, expirationDate, locale = DEFAULT_LOCALE) {
  const delta = parseInt(amount, 10);
  if (Number.isNaN(delta) || delta <= 0) {
    return { ok: false, error: appError("restockQtyPositive", locale) };
  }
  const trimmedLot = lotNumber?.trim();
  if (trimmedLot && trimmedLot.length < 2) {
    return { ok: false, error: appError("restockLotMin", locale) };
  }
  if (expirationDate) {
    const [y, m, d] = expirationDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) {
      return { ok: false, error: appError("expirationInvalid", locale) };
    }
  }
  const resolved = resolveBatchTarget(f.products, id, trimmedLot, expirationDate);
  if (!resolved.ok) return resolved;
  const newBatchId = resolved.targetProduct ? null : newEntityId("prd");

  if (f.setProducts) {
    f.setProducts((prev) => {
      const normalized = normalizeProducts(prev);
      if (resolved.targetProduct) {
        return sortProductsForCatalog(
          normalized.map((product) =>
            product.id === resolved.targetProduct.id
              ? {
                  ...product,
                  stock: (product.stock ?? 0) + delta,
                }
              : product
          )
        );
      }

      return sortProductsForCatalog([
        ...normalized,
        {
          ...resolved.sourceProduct,
            id: newBatchId,
          lotNumber: resolved.lotNumber,
          expirationDate: resolved.expirationDate,
          stock: delta,
        },
      ]);
    });
  }

  if (resolved.targetProduct) {
    return {
      ok: true,
      createNew: false,
      targetId: resolved.targetProduct.id,
      stock: (resolved.targetProduct.stock ?? 0) + delta,
      lotNumber: resolved.lotNumber,
      expirationDate: resolved.expirationDate,
    };
  }

  return {
    ok: true,
    createNew: true,
    targetId: newBatchId,
    name: resolved.sourceProduct.name,
    price: resolved.sourceProduct.price,
    stock: delta,
    lotNumber: resolved.lotNumber,
    expirationDate: resolved.expirationDate,
  };
}

export function useDatabase() {
  const ctx = useContext(DatabaseContext);
  if (!ctx) throw new Error("useDatabase must be used within DatabaseProvider");
  return ctx;
}
