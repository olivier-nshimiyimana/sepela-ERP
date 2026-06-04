import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Settings, X } from "lucide-react";
import { DEFAULT_INVOICE_PROFILE } from "../data/defaultInvoiceProfile";
import { DEFAULT_EXPIRY_ALERT_DAYS } from "../utils/productExpiry";
import { INVOICE_FORMATS } from "../utils/invoiceFormats";

const Box = "d" + "iv";

function toInputNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function formatSettingInput(value, fallback) {
  const n = toInputNumber(value, fallback);
  return String(n);
}

export default function SettingsModal({
  isOpen,
  exchangeRate,
  expiryAlertDays,
  invoiceProfile,
  backupHistory,
  cloudSync,
  activeTenant,
  sessionUser,
  syncQueueSummary,
  trainingMode = false,
  onClose,
  onSaveRate,
  onSaveExpiryDays,
  onSaveInvoiceProfile,
  onSaveTrainingMode,
  onSaveAllSettings,
  onSaveCloudSyncConfig,
  onRefreshCloudLeaseStatus,
  onPushPendingSync,
  onRefreshSyncQueue,
  onExportBackup,
  onRestoreBackup,
}) {
  const [rate, setRate] = useState(() => formatSettingInput(exchangeRate, 2850));
  const [alertDays, setAlertDays] = useState(() =>
    formatSettingInput(expiryAlertDays, DEFAULT_EXPIRY_ALERT_DAYS)
  );
  const [inv, setInv] = useState(() => ({
    ...DEFAULT_INVOICE_PROFILE,
    ...(invoiceProfile ?? {}),
  }));
  const [training, setTraining] = useState(trainingMode);
  const [cloudApiBaseUrl, setCloudApiBaseUrl] = useState(cloudSync?.apiBaseUrl ?? "");
  const [cloudApiToken, setCloudApiToken] = useState(cloudSync?.apiToken ?? "");
  const [cloudEnabled, setCloudEnabled] = useState(!!cloudSync?.enabled);
  const [cloudMerchantCode, setCloudMerchantCode] = useState(cloudSync?.merchantCode ?? "");
  const [cloudBranchCode, setCloudBranchCode] = useState(cloudSync?.branchCode ?? "");
  const [cloudDeviceCode, setCloudDeviceCode] = useState(cloudSync?.deviceCode ?? "");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const restoreInputRef = useRef(null);
  const openedSnapshotRef = useRef(false);

  const tenantCode = sessionUser?.merchantCode ?? activeTenant?.merchantCode ?? "";
  const tenantCloud =
    tenantCode && cloudSync?.merchantCode === tenantCode ? cloudSync : null;

  useEffect(() => {
    if (!isOpen) {
      openedSnapshotRef.current = false;
      return;
    }
    if (openedSnapshotRef.current) return;
    openedSnapshotRef.current = true;

    const scoped =
      tenantCode && cloudSync?.merchantCode === tenantCode ? cloudSync : null;
    setRate(formatSettingInput(exchangeRate, 2850));
    setAlertDays(formatSettingInput(expiryAlertDays, DEFAULT_EXPIRY_ALERT_DAYS));
    setInv({ ...DEFAULT_INVOICE_PROFILE, ...(invoiceProfile ?? {}) });
    setTraining(!!trainingMode);
    setCloudApiBaseUrl(cloudSync?.apiBaseUrl ?? "");
    setCloudApiToken(cloudSync?.apiToken ?? "");
    setCloudEnabled(!!cloudSync?.enabled);
    setCloudMerchantCode(tenantCode);
    setCloudBranchCode(scoped?.branchCode ?? "");
    setCloudDeviceCode(scoped?.deviceCode ?? "");
    setError("");
    setSuccessMessage("");
    setSaveBusy(false);
    setCloudBusy(false);
    setCloudMessage("");
    setBackupMessage("");
    setBackupBusy(false);
  }, [
    isOpen,
    exchangeRate,
    expiryAlertDays,
    invoiceProfile,
    trainingMode,
    cloudSync,
    tenantCode,
  ]);

  if (!isOpen) return null;

  const setField = (key) => (e) => setInv((prev) => ({ ...prev, [key]: e.target.value }));
  const backupMessageIsSuccess =
    backupMessage.toLowerCase().includes("success") ||
    backupMessage.toLowerCase().includes("restored");
  const cloudMessageIsSuccess =
    cloudMessage.toLowerCase().includes("saved") ||
    cloudMessage.toLowerCase().includes("synced") ||
    cloudMessage.toLowerCase().includes("nothing to sync") ||
    cloudMessage.toLowerCase().includes("activated");
  const leaseIsValid =
    tenantCloud?.leaseStatus === "ACTIVE" &&
    (!tenantCloud?.leaseValidUntil || new Date(tenantCloud.leaseValidUntil).getTime() > Date.now());

  const handleExportBackup = async () => {
    if (!onExportBackup) return;
    setBackupBusy(true);
    setBackupMessage("");
    try {
      const payload = await onExportBackup();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sepela-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupMessage("Backup exported successfully.");
    } catch (e) {
      setBackupMessage(`Could not export backup: ${e?.message ?? e}`);
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !onRestoreBackup) return;

    if (!window.confirm("Restore backup and replace current app data? This cannot be undone.")) {
      e.target.value = "";
      return;
    }

    setBackupBusy(true);
    setBackupMessage("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = await onRestoreBackup(parsed);
      if (!result.ok) {
        setBackupMessage(result.error);
        return;
      }
      setBackupMessage("Backup restored. Reloading app…");
      window.location.reload();
    } catch (err) {
      setBackupMessage(`Could not restore backup: ${err?.message ?? err}`);
    } finally {
      e.target.value = "";
      setBackupBusy(false);
    }
  };

  const handleSaveCloudConfig = async () => {
    if (!onSaveCloudSyncConfig) return;
    setCloudBusy(true);
    setCloudMessage("");
    try {
      const result = await onSaveCloudSyncConfig({
        apiBaseUrl: cloudApiBaseUrl,
        apiToken: cloudApiToken,
        merchantCode: cloudMerchantCode,
        branchCode: cloudBranchCode,
        deviceCode: cloudDeviceCode,
        enabled: cloudEnabled,
      });
      if (!result?.ok) {
        setCloudMessage(result?.error ?? "Could not save cloud sync settings.");
        return;
      }
      setCloudMessage("Cloud sync settings saved.");
      await onRefreshSyncQueue?.();
    } catch (err) {
      setCloudMessage(`Could not save cloud sync settings: ${err?.message ?? err}`);
    } finally {
      setCloudBusy(false);
    }
  };

  const handlePushCloudSync = async () => {
    if (!onPushPendingSync || !onSaveCloudSyncConfig) return;
    setCloudBusy(true);
    setCloudMessage("");
    try {
      const saveResult = await onSaveCloudSyncConfig({
        apiBaseUrl: cloudApiBaseUrl,
        apiToken: cloudApiToken,
        merchantCode: cloudMerchantCode,
        branchCode: cloudBranchCode,
        deviceCode: cloudDeviceCode,
        enabled: cloudEnabled,
      });
      if (!saveResult?.ok) {
        setCloudMessage(saveResult?.error ?? "Could not save cloud sync settings.");
        return;
      }

      const result = await onPushPendingSync();
      if (!result?.ok) {
        setCloudMessage(result?.error ?? "Could not push pending changes to the cloud.");
        return;
      }

      setCloudMessage(
        result.message ||
          (result.syncedCount > 0 ? `Synced ${result.syncedCount} item(s) to the cloud.` : "Nothing to sync.")
      );
    } catch (err) {
      setCloudMessage(`Cloud sync failed: ${err?.message ?? err}`);
    } finally {
      setCloudBusy(false);
    }
  };

  const handleRefreshLeaseStatus = async () => {
    if (!onRefreshCloudLeaseStatus) return;
    setCloudBusy(true);
    setCloudMessage("");
    try {
      const result = await onRefreshCloudLeaseStatus({
        apiBaseUrl: cloudApiBaseUrl,
        apiToken: cloudApiToken,
      });
      if (!result?.ok) {
        setCloudMessage(result?.error ?? "Could not refresh activation status.");
        return;
      }
      if (result.allowed) {
        setCloudMessage("License is active on the portal.");
      } else {
        setCloudMessage("Contact SEPELA INC — your store license is not active on the portal.");
      }
    } catch (err) {
      setCloudMessage(`Could not refresh activation status: ${err?.message ?? err}`);
    } finally {
      setCloudBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaveBusy(true);
    setError("");
    setSuccessMessage("");
    try {
      const prefix = (inv.invoicePrefix || "SEP").replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "SEP";
      const normalizedInvoiceProfile = {
        ...inv,
        invoicePrefix: prefix.toUpperCase(),
        companyName: inv.companyName?.trim() || DEFAULT_INVOICE_PROFILE.companyName,
        invoiceTitle: inv.invoiceTitle?.trim() || "INVOICE",
        defaultPrintFormat: INVOICE_FORMATS.some((f) => f.id === inv.defaultPrintFormat)
          ? inv.defaultPrintFormat
          : DEFAULT_INVOICE_PROFILE.defaultPrintFormat,
      };

      if (onSaveAllSettings) {
        const result = await onSaveAllSettings({
          exchangeRate: rate,
          expiryAlertDays: alertDays,
          invoiceProfile: normalizedInvoiceProfile,
          trainingMode: training,
        });
        if (!result?.ok) {
          setError(result?.error ?? "Could not save settings.");
          return;
        }
      } else {
        const rateResult = await onSaveRate(rate);
        if (!rateResult?.ok) {
          setError(rateResult?.error ?? "Could not save the exchange rate.");
          return;
        }

        const daysResult = await onSaveExpiryDays(alertDays);
        if (!daysResult?.ok) {
          setError(daysResult?.error ?? "Could not save the expiry alert window.");
          return;
        }

        const invoiceResult = await onSaveInvoiceProfile(normalizedInvoiceProfile);
        if (!invoiceResult?.ok) {
          setError(invoiceResult?.error ?? "Could not save invoice settings.");
          return;
        }

        if (onSaveTrainingMode) {
          const trainingResult = await onSaveTrainingMode(training);
          if (trainingResult && trainingResult.ok === false) {
            setError(trainingResult.error ?? "Could not save training mode.");
            return;
          }
        }
      }

      setSuccessMessage("Settings saved successfully.");
    } catch (err) {
      setError(`Could not save settings: ${err?.message ?? err}`);
    } finally {
      setSaveBusy(false);
    }
  };

  const modal = (
    <Box className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/80"
        aria-label="Close settings"
        onClick={onClose}
      />
      <Box
        className="relative bg-[#1a1a1a] border border-gray-800 w-full max-w-2xl max-h-[min(90vh,calc(100vh-2rem))] rounded-xl shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        <Box className="p-4 border-b border-gray-800 flex justify-between items-center shrink-0">
          <h3 id="settings-modal-title" className="font-bold flex items-center gap-2">
            <Settings className="text-blue-500" size={20} />
            Store &amp; invoice settings
          </h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </Box>
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
          <Box className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Exchange rate (CDF / USD)
            </label>
            <input
              type="number"
              min="1"
              step="1"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg p-3 text-xl font-mono text-white focus:border-blue-500 outline-none"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Box>
          <Box className="space-y-2 p-3 rounded-lg border border-amber-900/40 bg-amber-950/20">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={training}
                onChange={(e) => setTraining(e.target.checked)}
                className="rounded border-gray-600"
              />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                Training mode (EBM practice receipts)
              </span>
            </label>
            <p className="text-[11px] text-gray-500">
              Sales print as TRAINING (RT_TRAINING_SALES). No fiscal value; excluded from SDC
              until you turn this off.
            </p>
          </Box>

          <Box className="space-y-2">
            <label className="text-xs font-bold text-amber-500 uppercase tracking-widest">
              Expiry alert window (days)
            </label>
            <p className="text-[11px] text-gray-500">
              Manager is notified when a product expires within this many days.
            </p>
            <input
              type="number"
              min="1"
              max="365"
              step="1"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg p-3 text-xl font-mono text-white focus:border-amber-500 outline-none"
              value={alertDays}
              onChange={(e) => setAlertDays(e.target.value)}
            />
          </Box>

          <Box className="border-t border-gray-800 pt-5 space-y-3">
            <p className="text-xs font-bold text-cyan-500 uppercase tracking-widest">
              Invoice &amp; company (Sepela Inc · DRC)
            </p>
            <input
              type="text"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Company name"
              value={inv.companyName}
              onChange={setField("companyName")}
            />
            <input
              type="text"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Tagline / legal form (e.g. DRC)"
              value={inv.companyTagline}
              onChange={setField("companyTagline")}
            />
            <input
              type="text"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Address line 1"
              value={inv.addressLine1}
              onChange={setField("addressLine1")}
            />
            <input
              type="text"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Address line 2"
              value={inv.addressLine2}
              onChange={setField("addressLine2")}
            />
            <Box className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
                placeholder="City / province"
                value={inv.cityProvince}
                onChange={setField("cityProvince")}
              />
              <input
                type="text"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
                placeholder="Tax / RCCM ID"
                value={inv.taxId}
                onChange={setField("taxId")}
              />
            </Box>
            <Box className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
                placeholder="Phone"
                value={inv.phone}
                onChange={setField("phone")}
              />
              <input
                type="text"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
                placeholder="Email"
                value={inv.email}
                onChange={setField("email")}
              />
            </Box>
            <Box className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
                placeholder="Invoice title"
                value={inv.invoiceTitle}
                onChange={setField("invoiceTitle")}
              />
              <input
                type="text"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm font-mono uppercase"
                placeholder="Prefix (e.g. SEP)"
                value={inv.invoicePrefix}
                onChange={setField("invoicePrefix")}
              />
            </Box>
            <Box>
              <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">
                Default print format
              </label>
              <select
                className="w-full mt-1 bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
                value={inv.defaultPrintFormat || DEFAULT_INVOICE_PROFILE.defaultPrintFormat}
                onChange={setField("defaultPrintFormat")}
              >
                {INVOICE_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Box>
            <input
              type="text"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Subtitle under title (optional)"
              value={inv.invoiceSubtitle}
              onChange={setField("invoiceSubtitle")}
            />
            <input
              type="text"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Footer title"
              value={inv.footerTitle}
              onChange={setField("footerTitle")}
            />
            <textarea
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm min-h-[72px] focus:border-cyan-600 outline-none"
              placeholder="Footer text (terms, thank you, banking details…)"
              value={inv.footerBody}
              onChange={setField("footerBody")}
            />
          </Box>

          <Box className="border-t border-gray-800 pt-5 space-y-3">
            <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">
              Store license &amp; cloud sync
            </p>
            <Box
              className={`rounded-lg border p-3 text-[11px] text-gray-300 space-y-1 ${
                leaseIsValid
                  ? "border-emerald-900/40 bg-emerald-950/20"
                  : "border-red-900/40 bg-red-950/20"
              }`}
            >
              <p>
                License:{" "}
                <span className={leaseIsValid ? "text-emerald-300" : "text-red-300"}>
                  {leaseIsValid ? "Active" : "Not active"}
                </span>
              </p>
              <p>
                Merchant: <span className="text-gray-200">{tenantCloud?.merchantCode || cloudMerchantCode || "—"}</span>
              </p>
              <p>
                Branch: <span className="text-gray-200">{tenantCloud?.branchCode || cloudBranchCode || "—"}</span>
              </p>
              <p>
                Device: <span className="text-gray-200">{tenantCloud?.deviceCode || cloudDeviceCode || "—"}</span>
              </p>
              <p>
                Valid until:{" "}
                <span className={leaseIsValid ? "text-emerald-300" : "text-red-300"}>
                  {formatBackupTime(tenantCloud?.leaseValidUntil)}
                </span>
              </p>
              {!leaseIsValid ? (
                <p className="text-red-300 pt-1">
                  Contact SEPELA INC if your store is not activated or your license has expired.
                </p>
              ) : null}
              <button
                type="button"
                onClick={handleRefreshLeaseStatus}
                disabled={cloudBusy}
                className="mt-2 w-full border border-gray-700 text-gray-300 py-2 rounded-lg text-xs font-bold uppercase disabled:opacity-50"
              >
                Refresh license from portal
              </button>
            </Box>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cloudEnabled}
                onChange={(e) => setCloudEnabled(e.target.checked)}
                className="rounded border-gray-600"
                disabled={!leaseIsValid}
              />
              <span className="text-xs font-bold text-violet-300 uppercase tracking-widest">
                Enable cloud sync
              </span>
            </label>
            <Box className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <SyncStat label="Pending total" value={String(syncQueueSummary?.total ?? 0)} />
              <SyncStat label="Products" value={String(syncQueueSummary?.products ?? 0)} />
              <SyncStat label="Sales" value={String(syncQueueSummary?.sales ?? 0)} />
              <SyncStat label="Purchases" value={String(syncQueueSummary?.purchases ?? 0)} />
            </Box>
            <Box className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-gray-500">
              <p>
                Customers: <span className="text-gray-300">{syncQueueSummary?.customers ?? 0}</span>
              </p>
              <p>
                Suppliers: <span className="text-gray-300">{syncQueueSummary?.suppliers ?? 0}</span>
              </p>
              <p>
                Settings: <span className="text-gray-300">{syncQueueSummary?.settings ?? 0}</span>
              </p>
              <p>
                Snapshots: <span className="text-gray-300">{syncQueueSummary?.stockSnapshots ?? 0}</span>
              </p>
            </Box>
            <Box className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleSaveCloudConfig}
                disabled={cloudBusy}
                className="w-full border border-violet-800 bg-violet-950/30 text-violet-300 py-2 rounded-lg text-sm font-bold uppercase disabled:opacity-50"
              >
                Save cloud config
              </button>
              <button
                type="button"
                onClick={onRefreshSyncQueue}
                disabled={cloudBusy}
                className="w-full border border-gray-700 bg-[#0f0f0f] text-gray-300 py-2 rounded-lg text-sm font-bold uppercase disabled:opacity-50"
              >
                Refresh queue
              </button>
              <button
                type="button"
                onClick={handlePushCloudSync}
                disabled={cloudBusy}
                className="w-full border border-blue-800 bg-blue-950/30 text-blue-300 py-2 rounded-lg text-sm font-bold uppercase disabled:opacity-50"
              >
                {cloudBusy ? "Syncing..." : "Push pending now"}
              </button>
            </Box>
            <Box className="text-[11px] text-gray-500 space-y-1">
              <p>
                Last sync: <span className="text-gray-300">{formatBackupTime(tenantCloud?.lastSyncAt)}</span>
              </p>
              <p>
                Status: <span className="text-gray-300 uppercase">{tenantCloud?.lastSyncStatus ?? "idle"}</span>
              </p>
              {tenantCloud?.lastSyncSummary ? (
                <p>
                  Summary: <span className="text-gray-300">{tenantCloud.lastSyncSummary}</span>
                </p>
              ) : null}
              {tenantCloud?.lastSyncError ? (
                <p className="text-amber-400">Last error: {tenantCloud.lastSyncError}</p>
              ) : null}
            </Box>
            {cloudMessage && (
              <p className={`text-xs ${cloudMessageIsSuccess ? "text-green-400" : "text-amber-400"}`}>
                {cloudMessage}
              </p>
            )}
          </Box>

          <Box className="border-t border-gray-800 pt-5 space-y-3">
            <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest">
              Backup &amp; restore
            </p>
            <p className="text-[11px] text-gray-500">
              Export or restore products, customers, sales, settings, stock snapshots, and users.
            </p>
            <Box className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-500">
              <p>
                Last export:{" "}
                <span className="text-gray-300">
                  {formatBackupTime(backupHistory?.lastExportAt)}
                </span>
              </p>
              <p>
                Last restore:{" "}
                <span className="text-gray-300">
                  {formatBackupTime(backupHistory?.lastRestoreAt)}
                </span>
              </p>
            </Box>
            <Box className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportBackup}
                disabled={backupBusy}
                className="w-full border border-emerald-800 bg-emerald-950/30 text-emerald-400 py-2 rounded-lg text-sm font-bold uppercase disabled:opacity-50"
              >
                Export backup
              </button>
              <button
                type="button"
                onClick={() => restoreInputRef.current?.click()}
                disabled={backupBusy}
                className="w-full border border-amber-800 bg-amber-950/30 text-amber-400 py-2 rounded-lg text-sm font-bold uppercase disabled:opacity-50"
              >
                Restore backup
              </button>
            </Box>
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleRestoreFile}
              className="hidden"
            />
            {backupMessage && (
              <p className={`text-xs ${backupMessageIsSuccess ? "text-green-400" : "text-amber-400"}`}>
                {backupMessage}
              </p>
            )}
          </Box>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {successMessage && <p className="text-green-400 text-sm">{successMessage}</p>}
          <button
            type="submit"
            disabled={saveBusy}
            className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-bold uppercase disabled:opacity-50"
          >
            {saveBusy ? "Saving..." : "Save all settings"}
          </button>
        </form>
      </Box>
    </Box>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}

function formatBackupTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function SyncStat({ label, value }) {
  return (
    <Box className="rounded-lg border border-gray-800 bg-[#101010] px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-white">{value}</p>
    </Box>
  );
}

