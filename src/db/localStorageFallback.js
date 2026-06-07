/**
 * Browser-only fallback when not running inside Tauri (vite dev).
 * Same API shape as DatabaseContext sqlite mode.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { normalizeProducts, validateProductFields } from "../data/defaultProducts";
import { DEFAULT_INVOICE_PROFILE, resolveInvoiceProfile } from "../data/defaultInvoiceProfile";
import { DEFAULT_PRIMARY_CURRENCY, normalizePrimaryCurrency } from "../utils/currency";
import { DEFAULT_LOCALE, normalizeLocale } from "../i18n";
import { DEFAULT_EXPIRY_ALERT_DAYS } from "../utils/productExpiry";
import {
  findMatchingCustomer,
  sortCustomers,
  validateCustomerFields,
} from "../utils/customers";
import {
  findMatchingSupplier,
  sortSuppliers,
  validatePurchaseItems,
  validateSupplierFields,
} from "../utils/suppliers";
import {
  findMatchingProductBatch,
  isSameProductBatch,
  resolveBatchTarget,
  sortProductsForCatalog,
} from "../utils/productBatches";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { newEntityId, nowIso } from "../utils/ids";
import { receiptContextForNewSale } from "../domain/receiptTransaction";
import {
  activateDeviceOnCloud,
  applyCloudLeaseStatus,
  fetchCloudLeaseStatus,
  pushPendingToCloud,
} from "./syncQueue";

const COUNTER_KEY = "sepela-invoice-counter";
const LAST_BACKUP_EXPORT_AT_KEY = "sepela-last-backup-export-at";
const LAST_BACKUP_RESTORE_AT_KEY = "sepela-last-backup-restore-at";
const CLOUD_SYNC_API_BASE_URL_KEY = "sepela-cloud-sync-api-base-url";
const CLOUD_SYNC_API_TOKEN_KEY = "sepela-cloud-sync-api-token";
const CLOUD_SYNC_ENABLED_KEY = "sepela-cloud-sync-enabled";
const CLOUD_SYNC_MERCHANT_CODE_KEY = "sepela-cloud-sync-merchant-code";
const CLOUD_SYNC_BRANCH_CODE_KEY = "sepela-cloud-sync-branch-code";
const CLOUD_SYNC_DEVICE_CODE_KEY = "sepela-cloud-sync-device-code";
const CLOUD_SYNC_ACTIVATION_CODE_KEY = "sepela-cloud-sync-activation-code";
const CLOUD_SYNC_DEVICE_LABEL_KEY = "sepela-cloud-sync-device-label";
const CLOUD_SYNC_LEASE_STATUS_KEY = "sepela-cloud-sync-lease-status";
const CLOUD_SYNC_LEASE_TOKEN_KEY = "sepela-cloud-sync-lease-token";
const CLOUD_SYNC_LEASE_VALID_FROM_KEY = "sepela-cloud-sync-lease-valid-from";
const CLOUD_SYNC_LEASE_VALID_UNTIL_KEY = "sepela-cloud-sync-lease-valid-until";
const CLOUD_SYNC_LEASE_ISSUED_AT_KEY = "sepela-cloud-sync-lease-issued-at";
const CLOUD_SYNC_LAST_AT_KEY = "sepela-cloud-sync-last-at";
const CLOUD_SYNC_LAST_STATUS_KEY = "sepela-cloud-sync-last-status";
const CLOUD_SYNC_LAST_SUMMARY_KEY = "sepela-cloud-sync-last-summary";
const CLOUD_SYNC_LAST_ERROR_KEY = "sepela-cloud-sync-last-error";
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

function buildLeaseStatusQuery(config) {
  if (config.leaseToken) return { leaseToken: config.leaseToken };
  if (config.deviceCode && config.activationCode) {
    return { deviceCode: config.deviceCode, activationCode: config.activationCode };
  }
  return null;
}

function allocateInvoiceNumber(prefix) {
  const clean =
    (prefix || "SEP").toString().replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || "SEP";
  let n = parseInt(localStorage.getItem(COUNTER_KEY) || "1", 10);
  if (Number.isNaN(n) || n < 1) n = 1;
  const invoiceNumber = `${clean}-${String(n).padStart(5, "0")}`;
  localStorage.setItem(COUNTER_KEY, String(n + 1));
  return invoiceNumber;
}

export function useLocalStorageData() {
  const [rawProducts, setProducts] = useLocalStorage("sepela-products", []);
  const [sales, setSales] = useLocalStorage("sepela-sales", []);
  const [customersRaw, setCustomers] = useLocalStorage("sepela-customers", []);
  const [suppliersRaw, setSuppliers] = useLocalStorage("sepela-suppliers", []);
  const [purchasesRaw, setPurchases] = useLocalStorage("sepela-purchases", []);
  const [exchangeRate, setExchangeRate] = useLocalStorage("sepela-exchange-rate", 2850);
  const [primaryCurrency, setPrimaryCurrency] = useLocalStorage(
    "sepela-primary-currency",
    DEFAULT_PRIMARY_CURRENCY
  );
  const [language, setLanguage] = useLocalStorage("sepela-language", DEFAULT_LOCALE);
  const [expiryAlertDays, setExpiryAlertDays] = useLocalStorage(
    "sepela-expiry-alert-days",
    DEFAULT_EXPIRY_ALERT_DAYS
  );
  const [invoiceProfileRaw, setInvoiceProfileRaw] = useLocalStorage(
    "sepela-invoice-profile",
    DEFAULT_INVOICE_PROFILE
  );
  const [trainingMode, setTrainingMode] = useLocalStorage("sepela-training-mode", false);
  const [lastBackupExportAt, setLastBackupExportAt] = useLocalStorage(
    LAST_BACKUP_EXPORT_AT_KEY,
    null
  );
  const [lastBackupRestoreAt, setLastBackupRestoreAt] = useLocalStorage(
    LAST_BACKUP_RESTORE_AT_KEY,
    null
  );
  const [cloudSyncApiBaseUrl, setCloudSyncApiBaseUrl] = useLocalStorage(
    CLOUD_SYNC_API_BASE_URL_KEY,
    ""
  );
  const [cloudSyncApiToken, setCloudSyncApiToken] = useLocalStorage(
    CLOUD_SYNC_API_TOKEN_KEY,
    ""
  );
  const [cloudSyncEnabled, setCloudSyncEnabled] = useLocalStorage(
    CLOUD_SYNC_ENABLED_KEY,
    false
  );
  const [cloudSyncMerchantCode, setCloudSyncMerchantCode] = useLocalStorage(
    CLOUD_SYNC_MERCHANT_CODE_KEY,
    ""
  );
  const [cloudSyncBranchCode, setCloudSyncBranchCode] = useLocalStorage(
    CLOUD_SYNC_BRANCH_CODE_KEY,
    ""
  );
  const [cloudSyncDeviceCode, setCloudSyncDeviceCode] = useLocalStorage(
    CLOUD_SYNC_DEVICE_CODE_KEY,
    ""
  );
  const [cloudSyncActivationCode, setCloudSyncActivationCode] = useLocalStorage(
    CLOUD_SYNC_ACTIVATION_CODE_KEY,
    ""
  );
  const [cloudSyncDeviceLabel, setCloudSyncDeviceLabel] = useLocalStorage(
    CLOUD_SYNC_DEVICE_LABEL_KEY,
    ""
  );
  const [cloudSyncLeaseStatus, setCloudSyncLeaseStatus] = useLocalStorage(
    CLOUD_SYNC_LEASE_STATUS_KEY,
    ""
  );
  const [cloudSyncLeaseToken, setCloudSyncLeaseToken] = useLocalStorage(
    CLOUD_SYNC_LEASE_TOKEN_KEY,
    ""
  );
  const [cloudSyncLeaseValidFrom, setCloudSyncLeaseValidFrom] = useLocalStorage(
    CLOUD_SYNC_LEASE_VALID_FROM_KEY,
    null
  );
  const [cloudSyncLeaseValidUntil, setCloudSyncLeaseValidUntil] = useLocalStorage(
    CLOUD_SYNC_LEASE_VALID_UNTIL_KEY,
    null
  );
  const [cloudSyncLeaseIssuedAt, setCloudSyncLeaseIssuedAt] = useLocalStorage(
    CLOUD_SYNC_LEASE_ISSUED_AT_KEY,
    null
  );
  const [cloudSyncLastAt, setCloudSyncLastAt] = useLocalStorage(CLOUD_SYNC_LAST_AT_KEY, null);
  const [cloudSyncLastStatus, setCloudSyncLastStatus] = useLocalStorage(
    CLOUD_SYNC_LAST_STATUS_KEY,
    "idle"
  );
  const [cloudSyncLastSummary, setCloudSyncLastSummary] = useLocalStorage(
    CLOUD_SYNC_LAST_SUMMARY_KEY,
    ""
  );
  const [cloudSyncLastError, setCloudSyncLastError] = useLocalStorage(
    CLOUD_SYNC_LAST_ERROR_KEY,
    ""
  );

  const products = useMemo(
    () => sortProductsForCatalog(normalizeProducts(rawProducts)),
    [rawProducts]
  );
  const customers = useMemo(() => sortCustomers(customersRaw), [customersRaw]);
  const suppliers = useMemo(() => sortSuppliers(suppliersRaw), [suppliersRaw]);
  const purchases = useMemo(
    () =>
      [...purchasesRaw].sort(
        (a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime()
      ),
    [purchasesRaw]
  );
  const invoiceProfile = useMemo(
    () => resolveInvoiceProfile({ ...DEFAULT_INVOICE_PROFILE, ...invoiceProfileRaw }, language),
    [invoiceProfileRaw, language]
  );
  const cloudSync = useMemo(
    () => ({
      ...DEFAULT_CLOUD_SYNC,
      enabled: !!cloudSyncEnabled,
      apiBaseUrl: String(cloudSyncApiBaseUrl ?? "").trim(),
      apiToken: String(cloudSyncApiToken ?? ""),
      merchantCode: String(cloudSyncMerchantCode ?? "").trim(),
      branchCode: String(cloudSyncBranchCode ?? "").trim(),
      deviceCode: String(cloudSyncDeviceCode ?? "").trim(),
      activationCode: String(cloudSyncActivationCode ?? "").trim(),
      deviceLabel: String(cloudSyncDeviceLabel ?? "").trim(),
      leaseStatus: String(cloudSyncLeaseStatus ?? "").trim(),
      leaseToken: String(cloudSyncLeaseToken ?? "").trim(),
      leaseValidFrom: cloudSyncLeaseValidFrom,
      leaseValidUntil: cloudSyncLeaseValidUntil,
      leaseIssuedAt: cloudSyncLeaseIssuedAt,
      lastSyncAt: cloudSyncLastAt,
      lastSyncStatus: cloudSyncLastStatus ?? "idle",
      lastSyncSummary: cloudSyncLastSummary ?? "",
      lastSyncError: cloudSyncLastError ?? "",
    }),
    [
      cloudSyncApiBaseUrl,
      cloudSyncApiToken,
      cloudSyncEnabled,
      cloudSyncMerchantCode,
      cloudSyncBranchCode,
      cloudSyncDeviceCode,
      cloudSyncActivationCode,
      cloudSyncDeviceLabel,
      cloudSyncLeaseStatus,
      cloudSyncLeaseToken,
      cloudSyncLeaseValidFrom,
      cloudSyncLeaseValidUntil,
      cloudSyncLeaseIssuedAt,
      cloudSyncLastAt,
      cloudSyncLastStatus,
      cloudSyncLastSummary,
      cloudSyncLastError,
    ]
  );

  const saveCustomer = useCallback(
    (fields) => {
      const validated = validateCustomerFields(fields);
      if (!validated.ok) return validated;

      const ts = nowIso();
      let savedCustomer = null;

      setCustomers((prev) => {
        const current = sortCustomers(prev);
        const matched = findMatchingCustomer(current, validated.data);
        if (matched) {
          savedCustomer = {
            ...matched,
            ...validated.data,
            id: matched.id,
            updatedAt: ts,
            syncStatus: "PENDING",
          };
          return current.map((customer) =>
            customer.id === matched.id ? savedCustomer : customer
          );
        }

        savedCustomer = {
          id: newEntityId("cus"),
          ...validated.data,
          updatedAt: ts,
          syncStatus: "PENDING",
        };
        return sortCustomers([...current, savedCustomer]);
      });

      return { ok: true, customer: savedCustomer };
    },
    [setCustomers]
  );

  const saveSupplier = useCallback(
    (fields) => {
      const validated = validateSupplierFields(fields);
      if (!validated.ok) return validated;

      const ts = nowIso();
      let savedSupplier = null;

      setSuppliers((prev) => {
        const current = sortSuppliers(prev);
        const matched = findMatchingSupplier(current, validated.data);
        if (matched) {
          savedSupplier = {
            ...matched,
            ...validated.data,
            id: matched.id,
            updatedAt: ts,
            syncStatus: "PENDING",
          };
          return current.map((supplier) =>
            supplier.id === matched.id ? savedSupplier : supplier
          );
        }

        savedSupplier = {
          id: newEntityId("sup"),
          ...validated.data,
          updatedAt: ts,
          syncStatus: "PENDING",
        };
        return sortSuppliers([...current, savedSupplier]);
      });

      return { ok: true, supplier: savedSupplier };
    },
    [setSuppliers]
  );

  const recordSale = useCallback(
    (payload) => {
      const { invoicePrefix, trainingMode: tm, ...rest } = payload;
      const ctx = receiptContextForNewSale({ trainingMode: tm });
      const invoiceNumber = allocateInvoiceNumber(invoicePrefix);
      const entry = {
        id: newEntityId("inv"),
        invoiceNumber,
        timestamp: nowIso(),
        status: "completed",
        ...ctx,
        ...rest,
        updatedAt: nowIso(),
        syncStatus: "PENDING",
      };
      setSales((prev) => [entry, ...prev]);
      return entry;
    },
    [setSales]
  );

  const refundSale = useCallback(
    (saleId, { reason, restoreStock, byUserId, byUserName }) => {
      let outcome = { ok: false, error: "Unknown error." };
      setSales((prev) => {
        const sale = prev.find((s) => s.id === saleId);
        if (!sale) {
          outcome = { ok: false, error: "Invoice not found." };
          return prev;
        }
        if (sale.status === "refunded") {
          outcome = { ok: false, error: "This invoice was already refunded." };
          return prev;
        }
        outcome = { ok: true, sale };
        return prev.map((s) =>
          s.id === saleId
            ? {
                ...s,
                status: "refunded",
                updatedAt: nowIso(),
                syncStatus: "PENDING",
                refund: {
                  at: nowIso(),
                  reason: (reason && reason.trim()) || "—",
                  restoreStock: !!restoreStock,
                  byUserId,
                  byUserName,
                },
              }
            : s
        );
      });
      return outcome;
    },
    [setSales]
  );

  const incrementCopyIndex = useCallback(
    (saleId) => {
      let updated = null;
      setSales((prev) =>
        prev.map((s) => {
          if (s.id !== saleId) return s;
          updated = { ...s, copyIndex: (s.copyIndex ?? 0) + 1, updatedAt: nowIso(), syncStatus: "PENDING" };
          return updated;
        })
      );
      return updated;
    },
    [setSales]
  );

  const recordPurchase = useCallback(
    (payload) => {
      const supplierResult = saveSupplier(payload.supplier ?? {});
      if (!supplierResult.ok) return supplierResult;

      const itemResult = validatePurchaseItems(payload.items, products);
      if (!itemResult.ok) return itemResult;

      const supplier = supplierResult.supplier;
      const ts = nowIso();
      const purchaseId = newEntityId("pur");
      const nextProducts = [...products];
      const resolvedItems = [];

      for (const item of itemResult.items) {
        const batchResolution = resolveBatchTarget(
          nextProducts,
          item.productId,
          item.lotNumber,
          item.expirationDate
        );
        if (!batchResolution.ok) return batchResolution;

        if (batchResolution.targetProduct) {
          const targetIndex = nextProducts.findIndex(
            (product) => product.id === batchResolution.targetProduct.id
          );
          const target = nextProducts[targetIndex];
          nextProducts[targetIndex] = {
            ...target,
            stock: (target.stock ?? 0) + item.qty,
            updatedAt: ts,
            syncStatus: "PENDING",
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
            syncStatus: "PENDING",
          };
          nextProducts.push(newBatch);
          resolvedItems.push({
            ...item,
            productId: newBatch.id,
            productName: newBatch.name,
            lotNumber: newBatch.lotNumber,
            expirationDate: newBatch.expirationDate,
          });
        }
      }

      const purchase = {
        id: purchaseId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierPhone: supplier.phone,
        supplierAddress: supplier.address,
        reference: String(payload.reference ?? "").trim() || null,
        notes: String(payload.notes ?? "").trim() || null,
        totalCost: resolvedItems.reduce((sum, item) => sum + item.lineTotal, 0),
        timestamp: ts,
        createdByUserId: payload.createdByUserId ?? null,
        createdByUserName: payload.createdByUserName ?? null,
        updatedAt: ts,
        syncStatus: "PENDING",
        items: resolvedItems.map((item) => ({
          id: newEntityId("pit"),
          purchaseId,
          ...item,
        })),
      };

      setProducts(sortProductsForCatalog(normalizeProducts(nextProducts)));

      setPurchases((prev) => [purchase, ...prev]);
      return { ok: true, purchase };
    },
    [products, saveSupplier, setProducts, setPurchases]
  );

  const updateCustomer = useCallback(
    (id, fields) => {
      const validated = validateCustomerFields(fields);
      if (!validated.ok) return validated;

      const ts = nowIso();
      let updatedCustomer = null;

      setCustomers((prev) =>
        sortCustomers(
          prev.map((customer) => {
            if (customer.id !== id) return customer;
            updatedCustomer = {
              ...customer,
              ...validated.data,
              updatedAt: ts,
              syncStatus: "PENDING",
            };
            return updatedCustomer;
          })
        )
      );

      if (!updatedCustomer) {
        return { ok: false, error: "Client not found." };
      }

      return { ok: true, customer: updatedCustomer };
    },
    [setCustomers]
  );

  const deleteCustomer = useCallback(
    (id) => {
      let removed = false;
      setCustomers((prev) =>
        prev.filter((customer) => {
          if (customer.id === id) {
            removed = true;
            return false;
          }
          return true;
        })
      );
      return removed ? { ok: true } : { ok: false, error: "Client not found." };
    },
    [setCustomers]
  );

  const saveCloudSyncConfig = useCallback(
    async ({ apiBaseUrl, apiToken, enabled, merchantCode, branchCode, deviceCode }) => {
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
      if (enabled && !trimmedBranchCode) {
        return { ok: false, error: "Enter the branch code from the portal." };
      }
      if (enabled && !trimmedDeviceCode) {
        return { ok: false, error: "Enter the device code from the portal." };
      }
      setCloudSyncApiBaseUrl(trimmedUrl);
      setCloudSyncApiToken(String(apiToken ?? ""));
      setCloudSyncEnabled(!!enabled);
      setCloudSyncMerchantCode(trimmedMerchantCode);
      setCloudSyncBranchCode(trimmedBranchCode);
      setCloudSyncDeviceCode(trimmedDeviceCode);
      return { ok: true };
    },
    [
      setCloudSyncApiBaseUrl,
      setCloudSyncApiToken,
      setCloudSyncEnabled,
      setCloudSyncMerchantCode,
      setCloudSyncBranchCode,
      setCloudSyncDeviceCode,
    ]
  );

  const activateCloudDevice = useCallback(
    async ({ activationCode, deviceLabel, validDays }) => {
      const apiBaseUrl = String(cloudSyncApiBaseUrl ?? "").trim();
      const apiToken = String(cloudSyncApiToken ?? "");
      if (!apiBaseUrl) {
        return { ok: false, error: "Set the cloud API URL first." };
      }
      if (!apiToken) {
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

      const requestedDeviceCode = String(cloudSyncDeviceCode ?? "").trim() || buildProvisionalDeviceCode();
      try {
        if (!String(cloudSyncDeviceCode ?? "").trim()) {
          setCloudSyncDeviceCode(requestedDeviceCode);
          setCloudSyncActivationCode(trimmedActivationCode);
          setCloudSyncDeviceLabel(trimmedDeviceLabel);
        }

        const result = await activateDeviceOnCloud(
          apiBaseUrl,
          {
            activationCode: trimmedActivationCode,
            deviceLabel: trimmedDeviceLabel,
            deviceCode: requestedDeviceCode,
            validDays,
          },
          { apiToken }
        );
        const activationState = cloudSyncActivationState({
          activationCode: trimmedActivationCode,
          device: result.device,
          lease: result.lease,
        });
        setCloudSyncMerchantCode(String(result.merchantCode ?? "").trim());
        setCloudSyncBranchCode(String(result.branchCode ?? "").trim());
        setCloudSyncDeviceCode(String(result.device?.deviceCode ?? "").trim());
        setCloudSyncActivationCode(activationState.activationCode);
        setCloudSyncDeviceLabel(activationState.deviceLabel);
        setCloudSyncLeaseStatus(activationState.leaseStatus);
        setCloudSyncLeaseToken(activationState.leaseToken);
        setCloudSyncLeaseValidFrom(activationState.leaseValidFrom);
        setCloudSyncLeaseValidUntil(activationState.leaseValidUntil);
        setCloudSyncLeaseIssuedAt(activationState.leaseIssuedAt);
        return { ok: true, activation: result };
      } catch (error) {
        if (!String(cloudSyncDeviceCode ?? "").trim()) {
          setCloudSyncDeviceCode("");
          setCloudSyncActivationCode("");
          setCloudSyncDeviceLabel("");
        }
        return { ok: false, error: error?.message ?? String(error) };
      }
    },
    [
      cloudSyncApiBaseUrl,
      cloudSyncApiToken,
      cloudSyncDeviceCode,
      setCloudSyncMerchantCode,
      setCloudSyncBranchCode,
      setCloudSyncDeviceCode,
      setCloudSyncActivationCode,
      setCloudSyncDeviceLabel,
      setCloudSyncLeaseStatus,
      setCloudSyncLeaseToken,
      setCloudSyncLeaseValidFrom,
      setCloudSyncLeaseValidUntil,
      setCloudSyncLeaseIssuedAt,
    ]
  );

  const persistLeaseFromConfig = useCallback(
    (config) => {
      setCloudSyncMerchantCode(config.merchantCode);
      setCloudSyncBranchCode(config.branchCode);
      setCloudSyncDeviceCode(config.deviceCode);
      setCloudSyncActivationCode(config.activationCode);
      setCloudSyncDeviceLabel(config.deviceLabel);
      setCloudSyncLeaseStatus(config.leaseStatus);
      setCloudSyncLeaseToken(config.leaseToken);
      setCloudSyncLeaseValidFrom(config.leaseValidFrom);
      setCloudSyncLeaseValidUntil(config.leaseValidUntil);
      setCloudSyncLeaseIssuedAt(config.leaseIssuedAt);
      setCloudSyncEnabled(!!config.enabled);
    },
    [
      setCloudSyncMerchantCode,
      setCloudSyncBranchCode,
      setCloudSyncDeviceCode,
      setCloudSyncActivationCode,
      setCloudSyncDeviceLabel,
      setCloudSyncLeaseStatus,
      setCloudSyncLeaseToken,
      setCloudSyncLeaseValidFrom,
      setCloudSyncLeaseValidUntil,
      setCloudSyncLeaseIssuedAt,
      setCloudSyncEnabled,
    ]
  );

  const refreshCloudLeaseStatus = useCallback(
    async (overrides = {}) => {
      const config = {
        ...DEFAULT_CLOUD_SYNC,
        apiBaseUrl: String(overrides.apiBaseUrl ?? cloudSyncApiBaseUrl ?? "").trim(),
        apiToken: String(overrides.apiToken ?? cloudSyncApiToken ?? ""),
        merchantCode: String(overrides.merchantCode ?? cloudSyncMerchantCode ?? "").trim(),
        branchCode: String(overrides.branchCode ?? cloudSyncBranchCode ?? "").trim(),
        deviceCode: String(overrides.deviceCode ?? cloudSyncDeviceCode ?? "").trim(),
        activationCode: String(overrides.activationCode ?? cloudSyncActivationCode ?? "").trim(),
        deviceLabel: String(overrides.deviceLabel ?? cloudSyncDeviceLabel ?? "").trim(),
        leaseToken: String(overrides.leaseToken ?? cloudSyncLeaseToken ?? "").trim(),
        enabled: overrides.enabled ?? cloudSyncEnabled,
      };

      if (!config.apiBaseUrl || !config.apiToken) {
        return { ok: false, allowed: false, error: "Set the cloud API URL and bearer token first." };
      }

      const query = buildLeaseStatusQuery(config);
      if (!query) {
        return { ok: true, allowed: false, reason: "This device is not activated." };
      }

      try {
        const status = await fetchCloudLeaseStatus(config.apiBaseUrl, query, { apiToken: config.apiToken });
        const nextConfig = applyCloudLeaseStatus(config, status);
        persistLeaseFromConfig(nextConfig);
        if (!status.allowed) {
          const stamp = nowIso();
          setCloudSyncLastAt(stamp);
          setCloudSyncLastStatus("blocked");
          setCloudSyncLastSummary(status.reason ?? "Cloud activation is no longer valid.");
          setCloudSyncLastError(status.reason ?? "Cloud activation is no longer valid.");
        }
        return {
          ok: true,
          allowed: !!status.allowed,
          reason: status.reason ?? null,
          status,
          config: nextConfig,
        };
      } catch (error) {
        return { ok: false, allowed: false, error: error?.message ?? String(error) };
      }
    },
    [
      cloudSyncApiBaseUrl,
      cloudSyncApiToken,
      cloudSyncMerchantCode,
      cloudSyncBranchCode,
      cloudSyncDeviceCode,
      cloudSyncActivationCode,
      cloudSyncDeviceLabel,
      cloudSyncLeaseToken,
      cloudSyncEnabled,
      persistLeaseFromConfig,
      setCloudSyncLastAt,
      setCloudSyncLastStatus,
      setCloudSyncLastSummary,
      setCloudSyncLastError,
    ]
  );

  const leaseRefreshStarted = useRef(false);
  useEffect(() => {
    if (leaseRefreshStarted.current) return;
    const query = buildLeaseStatusQuery(cloudSync);
    if (!query || !cloudSync.apiBaseUrl || !cloudSync.apiToken) return;
    leaseRefreshStarted.current = true;
    refreshCloudLeaseStatus().catch(() => {
      leaseRefreshStarted.current = false;
    });
  }, [cloudSync, refreshCloudLeaseStatus]);

  const pushPendingSync = useCallback(async (overrides = {}) => {
    const apiBaseUrl = String(overrides.apiBaseUrl ?? cloudSyncApiBaseUrl ?? "").trim();
    if (!apiBaseUrl) {
      return { ok: false, error: "Set the cloud API URL first." };
    }

    const bindingQuery = buildLeaseStatusQuery({
      leaseToken: String(overrides.leaseToken ?? cloudSyncLeaseToken ?? "").trim(),
      deviceCode: String(overrides.deviceCode ?? cloudSyncDeviceCode ?? "").trim(),
      activationCode: String(overrides.activationCode ?? cloudSyncActivationCode ?? "").trim(),
    });
    let leaseConfig = null;
    if (bindingQuery) {
      const leaseCheck = await refreshCloudLeaseStatus(overrides);
      if (!leaseCheck.ok) {
        return { ok: false, error: leaseCheck.error ?? "Could not verify cloud activation." };
      }
      if (!leaseCheck.allowed) {
        return { ok: false, error: leaseCheck.reason ?? "Cloud activation is no longer valid." };
      }
      leaseConfig = leaseCheck.config ?? null;
    }

    const activeConfig = {
      apiBaseUrl,
      apiToken: String(overrides.apiToken ?? cloudSyncApiToken ?? ""),
      merchantCode: String(leaseConfig?.merchantCode ?? overrides.merchantCode ?? cloudSyncMerchantCode ?? "").trim(),
      branchCode: String(leaseConfig?.branchCode ?? overrides.branchCode ?? cloudSyncBranchCode ?? "").trim(),
      deviceCode: String(leaseConfig?.deviceCode ?? overrides.deviceCode ?? cloudSyncDeviceCode ?? "").trim(),
      leaseToken: String(leaseConfig?.leaseToken ?? overrides.leaseToken ?? cloudSyncLeaseToken ?? "").trim(),
    };

    const payload = {
      products: products.filter((row) => row.syncStatus !== "SYNCED"),
      customers: customers.filter((row) => row.syncStatus !== "SYNCED"),
      suppliers: suppliers.filter((row) => row.syncStatus !== "SYNCED"),
      sales: sales.filter((row) => row.syncStatus !== "SYNCED"),
      purchases: purchases.filter((row) => row.syncStatus !== "SYNCED"),
      settings: [],
      stockSnapshots: [],
    };

    const sentCount = Object.values(payload).reduce((sum, rows) => sum + rows.length, 0);
    if (sentCount === 0) {
      const stamp = nowIso();
      setCloudSyncLastAt(stamp);
      setCloudSyncLastStatus("idle");
      setCloudSyncLastSummary("Nothing to sync.");
      setCloudSyncLastError("");
      return { ok: true, syncedCount: 0, failedCount: 0, remainingCount: 0, message: "Nothing to sync." };
    }

    try {
      const result = await pushPendingToCloud(apiBaseUrl, payload, {
        apiToken: activeConfig.apiToken,
        merchantCode: activeConfig.merchantCode,
        branchCode: activeConfig.branchCode,
        deviceCode: activeConfig.deviceCode,
        leaseToken: activeConfig.leaseToken,
        source: "localStorage",
      });
      const syncedIds = new Map(
        Object.entries(result.synced ?? {}).map(([table, ids]) => [table, new Set(ids ?? [])])
      );
      const failedIds = new Map(
        Object.entries(result.failed ?? {}).map(([table, ids]) => [table, new Set(ids ?? [])])
      );

      const markRows = (rows, table) =>
        rows.map((row) => {
          const id = row.id ?? row.key;
          if (syncedIds.get(table)?.has(id)) return { ...row, syncStatus: "SYNCED" };
          if (failedIds.get(table)?.has(id)) return { ...row, syncStatus: "FAILED" };
          return row;
        });

      setProducts((prev) => sortProductsForCatalog(normalizeProducts(markRows(prev, "products"))));
      setCustomers((prev) => sortCustomers(markRows(prev, "customers")));
      setSuppliers((prev) => sortSuppliers(markRows(prev, "suppliers")));
      setSales((prev) => markRows(prev, "sales"));
      setPurchases((prev) => markRows(prev, "purchases"));

      const stamp = nowIso();
      const syncedCount = Object.values(result.synced ?? {}).reduce((sum, ids) => sum + (ids?.length ?? 0), 0);
      const failedCount = Object.values(result.failed ?? {}).reduce((sum, ids) => sum + (ids?.length ?? 0), 0);
      const remainingCount = sentCount - syncedCount;
      setCloudSyncLastAt(stamp);
      setCloudSyncLastStatus(failedCount ? "partial" : "success");
      setCloudSyncLastSummary(result.message ?? `Synced ${syncedCount} item(s).`);
      setCloudSyncLastError(failedCount ? `${failedCount} item(s) still need attention.` : "");
      return {
        ok: true,
        syncedCount,
        failedCount,
        remainingCount,
        message: result.message ?? `Synced ${syncedCount} item(s).`,
      };
    } catch (error) {
      const stamp = nowIso();
      setCloudSyncLastAt(stamp);
      setCloudSyncLastStatus("failed");
      setCloudSyncLastSummary("Cloud sync failed.");
      setCloudSyncLastError(error?.message ?? String(error));
      return { ok: false, error: error?.message ?? String(error) };
    }
  }, [
    refreshCloudLeaseStatus,
    cloudSyncApiBaseUrl,
    cloudSyncApiToken,
    cloudSyncMerchantCode,
    cloudSyncBranchCode,
    cloudSyncDeviceCode,
    cloudSyncLeaseToken,
    cloudSyncActivationCode,
    products,
    customers,
    suppliers,
    sales,
    purchases,
    setProducts,
    setCustomers,
    setSuppliers,
    setSales,
    setPurchases,
    setCloudSyncLastAt,
    setCloudSyncLastStatus,
    setCloudSyncLastSummary,
    setCloudSyncLastError,
  ]);

  return {
    storageMode: "localStorage",
    ready: true,
    products,
    sales,
    customers,
    suppliers,
    purchases,
    exchangeRate,
    primaryCurrency: normalizePrimaryCurrency(primaryCurrency),
    language: normalizeLocale(language),
    setLanguage,
    expiryAlertDays,
    invoiceProfile,
    backupHistory: {
      lastExportAt: lastBackupExportAt,
      lastRestoreAt: lastBackupRestoreAt,
    },
    cloudSync,
    trainingMode,
    setTrainingMode,
    setProducts,
    setCustomers,
    setSuppliers,
    setSales,
    setPurchases,
    recordSale,
    recordPurchase,
    refundSale,
    incrementCopyIndex,
    saveCustomer,
    saveSupplier,
    updateCustomer,
    deleteCustomer,
    setExchangeRate,
    setPrimaryCurrency: (value) => setPrimaryCurrency(normalizePrimaryCurrency(value)),
    setExpiryAlertDays,
    setInvoiceProfileRaw,
    setLastBackupExportAt,
    setLastBackupRestoreAt,
    saveCloudSyncConfig,
    activateCloudDevice,
    refreshCloudLeaseStatus,
    pushPendingSync,
    validateProductFields,
    normalizeProducts,
    listPendingSync: () => ({
      products: products.filter((row) => row.syncStatus !== "SYNCED").map((row) => ({ id: row.id, sync_status: row.syncStatus })),
      customers: customers.filter((row) => row.syncStatus !== "SYNCED").map((row) => ({ id: row.id, sync_status: row.syncStatus })),
      suppliers: suppliers.filter((row) => row.syncStatus !== "SYNCED").map((row) => ({ id: row.id, sync_status: row.syncStatus })),
      sales: sales.filter((row) => row.syncStatus !== "SYNCED").map((row) => ({ id: row.id, sync_status: row.syncStatus })),
      purchases: purchases.filter((row) => row.syncStatus !== "SYNCED").map((row) => ({ id: row.id, sync_status: row.syncStatus })),
      settings: [],
      stockSnapshots: [],
    }),
  };
}
