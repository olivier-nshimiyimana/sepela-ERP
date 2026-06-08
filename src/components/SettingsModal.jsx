import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Settings, Trash2, X } from "lucide-react";
import { DEFAULT_INVOICE_PROFILE, resolveInvoiceProfile } from "../data/defaultInvoiceProfile";
import {
  readCompanyLogoFile,
  reprocessLogoDataUrl,
  sanitizeCompanyLogo,
} from "../utils/companyLogo";
import { CURRENCY, DEFAULT_PRIMARY_CURRENCY, normalizePrimaryCurrency } from "../utils/currency";
import { DEFAULT_LOCALE, normalizeLocale } from "../i18n";
import { useLocale } from "../contexts/LocaleContext";
import LanguagePicker from "./LanguagePicker";
import { DEFAULT_EXPIRY_ALERT_DAYS } from "../utils/productExpiry";
import { getInvoiceFormatLabel, INVOICE_FORMATS } from "../utils/invoiceFormats";
import {
  MAX_IDLE_MINUTES,
  MIN_IDLE_MINUTES,
  readIdleMusicSettings,
  writeIdleMusicSettings,
} from "../utils/idleMusicSettings";

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
  primaryCurrency = DEFAULT_PRIMARY_CURRENCY,
  language = DEFAULT_LOCALE,
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
  const { t, tError, locale } = useLocale();
  const [rate, setRate] = useState(() => formatSettingInput(exchangeRate, 2850));
  const [currency, setCurrency] = useState(() => normalizePrimaryCurrency(primaryCurrency));
  const [appLanguage, setAppLanguage] = useState(() => normalizeLocale(language));
  const [alertDays, setAlertDays] = useState(() =>
    formatSettingInput(expiryAlertDays, DEFAULT_EXPIRY_ALERT_DAYS)
  );
  const [inv, setInv] = useState(() =>
    resolveInvoiceProfile(
      { ...DEFAULT_INVOICE_PROFILE, ...(invoiceProfile ?? {}) },
      normalizeLocale(language)
    )
  );
  const [training, setTraining] = useState(trainingMode);
  const [idleMusicMinutes, setIdleMusicMinutes] = useState(() =>
    String(readIdleMusicSettings().idleMinutes)
  );
  const [idleMusicEnabled, setIdleMusicEnabled] = useState(() => readIdleMusicSettings().enabled);
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
  const [cloudMessageSuccess, setCloudMessageSuccess] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupMessageSuccess, setBackupMessageSuccess] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const restoreInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const openedSnapshotRef = useRef(false);
  const [logoBusy, setLogoBusy] = useState(false);

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
    setCurrency(normalizePrimaryCurrency(primaryCurrency));
    setAppLanguage(normalizeLocale(language));
    setAlertDays(formatSettingInput(expiryAlertDays, DEFAULT_EXPIRY_ALERT_DAYS));
    setInv(
      resolveInvoiceProfile(
        { ...DEFAULT_INVOICE_PROFILE, ...(invoiceProfile ?? {}) },
        normalizeLocale(language)
      )
    );
    setTraining(!!trainingMode);
    setIdleMusicMinutes(String(readIdleMusicSettings().idleMinutes));
    setIdleMusicEnabled(readIdleMusicSettings().enabled);
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
    primaryCurrency,
    language,
    expiryAlertDays,
    invoiceProfile,
    trainingMode,
    cloudSync,
    tenantCode,
  ]);

  if (!isOpen) return null;

  const setField = (key) => (e) => setInv((prev) => ({ ...prev, [key]: e.target.value }));

  const handleLogoPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoBusy(true);
    setError("");
    const result = await readCompanyLogoFile(file, appLanguage);
    setLogoBusy(false);
    if (!result.ok) {
      setError(tError(result.error));
      return;
    }
    setInv((prev) => ({ ...prev, companyLogo: result.dataUrl }));
  };

  const handleLogoRemove = () => {
    setInv((prev) => ({ ...prev, companyLogo: "" }));
    setError("");
  };
  const backupMessageIsSuccess = backupMessageSuccess;
  const cloudMessageIsSuccess = cloudMessageSuccess;
  const leaseIsValid =
    tenantCloud?.leaseStatus === "ACTIVE" &&
    (!tenantCloud?.leaseValidUntil || new Date(tenantCloud.leaseValidUntil).getTime() > Date.now());

  const handleExportBackup = async () => {
    if (!onExportBackup) return;
    setBackupBusy(true);
    setBackupMessage("");
    setBackupMessageSuccess(false);
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
      setBackupMessage(t("settings.backupExported"));
      setBackupMessageSuccess(true);
    } catch (e) {
      setBackupMessage(t("settings.backupExportFailed", { error: e?.message ?? e }));
      setBackupMessageSuccess(false);
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !onRestoreBackup) return;

    if (!window.confirm(t("settings.backupRestoreConfirm"))) {
      e.target.value = "";
      return;
    }

    setBackupBusy(true);
    setBackupMessage("");
    setBackupMessageSuccess(false);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = await onRestoreBackup(parsed);
      if (!result.ok) {
        setBackupMessage(tError(result.error));
        setBackupMessageSuccess(false);
        return;
      }
      setBackupMessage(t("settings.backupRestored"));
      setBackupMessageSuccess(true);
      window.location.reload();
    } catch (err) {
      setBackupMessage(t("settings.backupRestoreFailed", { error: err?.message ?? err }));
      setBackupMessageSuccess(false);
    } finally {
      e.target.value = "";
      setBackupBusy(false);
    }
  };

  const handleSaveCloudConfig = async () => {
    if (!onSaveCloudSyncConfig) return;
    setCloudBusy(true);
    setCloudMessage("");
    setCloudMessageSuccess(false);
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
        setCloudMessage(tError(result?.error) || t("settings.cloudSaveFailed"));
        setCloudMessageSuccess(false);
        return;
      }
      setCloudMessage(t("settings.cloudSaved"));
      setCloudMessageSuccess(true);
      await onRefreshSyncQueue?.();
    } catch (err) {
      setCloudMessage(t("settings.cloudSyncFailed", { error: err?.message ?? err }));
      setCloudMessageSuccess(false);
    } finally {
      setCloudBusy(false);
    }
  };

  const handlePushCloudSync = async () => {
    if (!onPushPendingSync || !onSaveCloudSyncConfig) return;
    setCloudBusy(true);
    setCloudMessage("");
    setCloudMessageSuccess(false);
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
        setCloudMessage(tError(saveResult?.error) || t("settings.cloudSaveFailed"));
        setCloudMessageSuccess(false);
        return;
      }

      const result = await onPushPendingSync();
      if (!result?.ok) {
        setCloudMessage(tError(result?.error) || t("settings.cloudPushFailed"));
        setCloudMessageSuccess(false);
        return;
      }

      setCloudMessage(
        result.syncedCount > 0
          ? t("settings.cloudSynced", { count: result.syncedCount })
          : t("settings.cloudNothingToSync")
      );
      setCloudMessageSuccess(true);
    } catch (err) {
      setCloudMessage(t("settings.cloudSyncFailed", { error: err?.message ?? err }));
      setCloudMessageSuccess(false);
    } finally {
      setCloudBusy(false);
    }
  };

  const handleRefreshLeaseStatus = async () => {
    if (!onRefreshCloudLeaseStatus) return;
    setCloudBusy(true);
    setCloudMessage("");
    setCloudMessageSuccess(false);
    try {
      const result = await onRefreshCloudLeaseStatus({
        apiBaseUrl: cloudApiBaseUrl,
        apiToken: cloudApiToken,
      });
      if (!result?.ok) {
        setCloudMessage(tError(result?.error) || t("settings.cloudRefreshFailed"));
        setCloudMessageSuccess(false);
        return;
      }
      if (result.allowed) {
        setCloudMessage(t("settings.licenseActivePortal"));
        setCloudMessageSuccess(true);
      } else {
        setCloudMessage(t("settings.licenseInactivePortal"));
        setCloudMessageSuccess(false);
      }
    } catch (err) {
      setCloudMessage(t("settings.cloudRefreshError", { error: err?.message ?? err }));
      setCloudMessageSuccess(false);
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
      const parsedIdleMinutes = Number.parseInt(String(idleMusicMinutes).trim(), 10);
      if (
        !Number.isFinite(parsedIdleMinutes) ||
        parsedIdleMinutes < MIN_IDLE_MINUTES ||
        parsedIdleMinutes > MAX_IDLE_MINUTES
      ) {
        setError(t("settings.invalidIdleMusicMinutes"));
        return;
      }

      const prefix = (inv.invoicePrefix || "SEP").replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "SEP";
      let companyLogo = sanitizeCompanyLogo(inv.companyLogo);
      if (companyLogo.startsWith("data:image/jpeg") || companyLogo.startsWith("data:image/webp")) {
        companyLogo = (await reprocessLogoDataUrl(companyLogo)) || companyLogo;
      }
      const normalizedInvoiceProfile = {
        ...inv,
        invoicePrefix: prefix.toUpperCase(),
        companyName: inv.companyName?.trim() || "",
        companyLogo,
        invoiceTitle: inv.invoiceTitle?.trim() || "",
        defaultPrintFormat: INVOICE_FORMATS.some((f) => f.id === inv.defaultPrintFormat)
          ? inv.defaultPrintFormat
          : DEFAULT_INVOICE_PROFILE.defaultPrintFormat,
      };

      if (onSaveAllSettings) {
        const result = await onSaveAllSettings({
          exchangeRate: rate,
          primaryCurrency: currency,
          language: appLanguage,
          expiryAlertDays: alertDays,
          invoiceProfile: normalizedInvoiceProfile,
          trainingMode: training,
        });
        if (!result?.ok) {
          setError(tError(result?.error) || t("settings.saveFailed"));
          return;
        }
      } else {
        const rateResult = await onSaveRate(rate);
        if (!rateResult?.ok) {
          setError(tError(rateResult?.error) || t("settings.saveRateFailed"));
          return;
        }

        const daysResult = await onSaveExpiryDays(alertDays);
        if (!daysResult?.ok) {
          setError(tError(daysResult?.error) || t("settings.saveExpiryFailed"));
          return;
        }

        const invoiceResult = await onSaveInvoiceProfile(normalizedInvoiceProfile);
        if (!invoiceResult?.ok) {
          setError(tError(invoiceResult?.error) || t("settings.saveInvoiceFailed"));
          return;
        }

        if (onSaveTrainingMode) {
          const trainingResult = await onSaveTrainingMode(training);
          if (trainingResult && trainingResult.ok === false) {
            setError(tError(trainingResult.error) || t("settings.saveTrainingFailed"));
            return;
          }
        }
      }

      writeIdleMusicSettings({ idleMinutes: parsedIdleMinutes, enabled: idleMusicEnabled });
      setIdleMusicMinutes(String(parsedIdleMinutes));
      setSuccessMessage(t("settings.saved"));
    } catch (err) {
      setError(t("settings.saveSettingsError", { error: err?.message ?? err }));
    } finally {
      setSaveBusy(false);
    }
  };

  const modal = (
    <Box className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/80"
        aria-label={t("common.close")}
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
            {t("settings.title")}
          </h3>
          <button type="button" onClick={onClose} aria-label={t("common.close")}>
            <X size={20} />
          </button>
        </Box>
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
          <LanguagePicker value={appLanguage} onChange={setAppLanguage} />

          <Box className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              {t("settings.primaryCurrency")}
            </label>
            <Box className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCurrency(CURRENCY.CDF)}
                className={`py-3 px-3 rounded-lg border text-left transition-colors ${
                  currency === CURRENCY.CDF
                    ? "border-green-500 bg-green-950/30 text-white"
                    : "border-gray-700 bg-[#0a0a0a] text-gray-400 hover:border-gray-500"
                }`}
              >
                <span className="block text-sm font-bold">CDF</span>
                <span className="block text-[10px] text-gray-500 mt-0.5">{t("settings.cdfLabel")}</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrency(CURRENCY.USD)}
                className={`py-3 px-3 rounded-lg border text-left transition-colors ${
                  currency === CURRENCY.USD
                    ? "border-blue-500 bg-blue-950/30 text-white"
                    : "border-gray-700 bg-[#0a0a0a] text-gray-400 hover:border-gray-500"
                }`}
              >
                <span className="block text-sm font-bold">USD</span>
                <span className="block text-[10px] text-gray-500 mt-0.5">{t("settings.usdLabel")}</span>
              </button>
            </Box>
            <p className="text-[11px] text-gray-500">{t("settings.currencyHint")}</p>
          </Box>
          <Box className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              {t("settings.exchangeRate")}
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
                {t("settings.trainingMode")}
              </span>
            </label>
            <p className="text-[11px] text-gray-500">{t("settings.trainingHint")}</p>
          </Box>

          <Box className="space-y-2">
            <label className="text-xs font-bold text-amber-500 uppercase tracking-widest">
              {t("settings.expiryWindow")}
            </label>
            <p className="text-[11px] text-gray-500">{t("settings.expiryHint")}</p>
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

          <Box className="space-y-2 p-3 rounded-lg border border-emerald-900/40 bg-emerald-950/20">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
              {t("settings.idleMusicSection")}
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={idleMusicEnabled}
                onChange={(e) => setIdleMusicEnabled(e.target.checked)}
                className="rounded border-gray-600"
              />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {t("settings.idleMusicEnabled")}
              </span>
            </label>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              {t("settings.idleMusicMinutes")}
            </label>
            <input
              type="number"
              min={MIN_IDLE_MINUTES}
              max={MAX_IDLE_MINUTES}
              step="1"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg p-3 text-xl font-mono text-white focus:border-emerald-500 outline-none"
              value={idleMusicMinutes}
              onChange={(e) => setIdleMusicMinutes(e.target.value)}
            />
          </Box>

          <Box className="border-t border-gray-800 pt-5 space-y-3">
            <p className="text-xs font-bold text-cyan-500 uppercase tracking-widest">
              {t("settings.invoiceSection")}
              {tenantCode ? ` (${tenantCode})` : ""}
            </p>
            {tenantCode ? (
              <p className="text-[11px] text-gray-500">{t("settings.merchantOnly")}</p>
            ) : null}
            <Box className="rounded-lg border border-gray-800 bg-[#0a0a0a] p-3 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                {t("settings.logoSection")}
              </p>
              <Box className="flex flex-wrap items-center gap-3">
                {inv.companyLogo ? (
                  <img
                    src={inv.companyLogo}
                    alt={t("settings.logoPreviewAlt")}
                    className="max-h-14 max-w-[120px] object-contain"
                    style={{ background: "transparent" }}
                  />
                ) : (
                  <Box className="flex h-14 w-[120px] items-center justify-center rounded border border-dashed border-gray-700 text-[10px] text-gray-600">
                    {t("settings.noLogo")}
                  </Box>
                )}
                <Box className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={logoBusy || saveBusy}
                    onClick={() => logoInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                  >
                    <ImagePlus size={14} />
                    {logoBusy
                      ? t("settings.processing")
                      : inv.companyLogo
                        ? t("settings.replaceLogo")
                        : t("settings.uploadLogo")}
                  </button>
                  {inv.companyLogo ? (
                    <button
                      type="button"
                      disabled={logoBusy || saveBusy}
                      onClick={handleLogoRemove}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/60 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-950/40 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      {t("settings.removeLogo")}
                    </button>
                  ) : null}
                </Box>
              </Box>
              <p className="text-[10px] text-gray-600">
                {t("settings.logoHint")}
              </p>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleLogoPick}
              />
            </Box>
            <input
              type="text"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder={t("settings.placeholderCompanyName")}
              value={inv.companyName}
              onChange={setField("companyName")}
            />
            <input
              type="text"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder={t("settings.placeholderTagline")}
              value={inv.companyTagline}
              onChange={setField("companyTagline")}
            />
            <input
              type="text"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder={t("settings.placeholderAddress1")}
              value={inv.addressLine1}
              onChange={setField("addressLine1")}
            />
            <input
              type="text"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder={t("settings.placeholderAddress2")}
              value={inv.addressLine2}
              onChange={setField("addressLine2")}
            />
            <Box className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
                placeholder={t("settings.placeholderCity")}
                value={inv.cityProvince}
                onChange={setField("cityProvince")}
              />
              <input
                type="text"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
                placeholder={t("settings.placeholderTax")}
                value={inv.taxId}
                onChange={setField("taxId")}
              />
            </Box>
            <Box className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
                placeholder={t("settings.placeholderPhone")}
                value={inv.phone}
                onChange={setField("phone")}
              />
              <input
                type="text"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
                placeholder={t("settings.placeholderEmail")}
                value={inv.email}
                onChange={setField("email")}
              />
            </Box>
            <Box className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
                placeholder={t("settings.placeholderInvoiceTitle")}
                value={inv.invoiceTitle}
                onChange={setField("invoiceTitle")}
              />
              <input
                type="text"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm font-mono uppercase"
                placeholder={t("settings.placeholderPrefix")}
                value={inv.invoicePrefix}
                onChange={setField("invoicePrefix")}
              />
            </Box>
            <Box>
              <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">
                {t("settings.defaultPrintFormat")}
              </label>
              <select
                className="w-full mt-1 bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
                value={inv.defaultPrintFormat || DEFAULT_INVOICE_PROFILE.defaultPrintFormat}
                onChange={setField("defaultPrintFormat")}
              >
                {INVOICE_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {getInvoiceFormatLabel(f.id, locale)}
                  </option>
                ))}
              </select>
            </Box>
            <input
              type="text"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder={t("settings.placeholderSubtitle")}
              value={inv.invoiceSubtitle}
              onChange={setField("invoiceSubtitle")}
            />
            <input
              type="text"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder={t("settings.placeholderFooterTitle")}
              value={inv.footerTitle}
              onChange={setField("footerTitle")}
            />
            <textarea
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-sm min-h-[72px] focus:border-cyan-600 outline-none"
              placeholder={t("settings.placeholderFooterBody")}
              value={inv.footerBody}
              onChange={setField("footerBody")}
            />
          </Box>

          <Box className="border-t border-gray-800 pt-5 space-y-3">
            <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">
              {t("settings.licenseSection")}
            </p>
            <Box
              className={`rounded-lg border p-3 text-[11px] text-gray-300 space-y-1 ${
                leaseIsValid
                  ? "border-emerald-900/40 bg-emerald-950/20"
                  : "border-red-900/40 bg-red-950/20"
              }`}
            >
              <p>
                {t("settings.license")}:{" "}
                <span className={leaseIsValid ? "text-emerald-300" : "text-red-300"}>
                  {leaseIsValid ? t("settings.licenseActive") : t("settings.licenseInactive")}
                </span>
              </p>
              <p>
                {t("settings.merchant")}: <span className="text-gray-200">{tenantCloud?.merchantCode || cloudMerchantCode || "—"}</span>
              </p>
              <p>
                {t("settings.branch")}: <span className="text-gray-200">{tenantCloud?.branchCode || cloudBranchCode || "—"}</span>
              </p>
              <p>
                {t("settings.device")}: <span className="text-gray-200">{tenantCloud?.deviceCode || cloudDeviceCode || "—"}</span>
              </p>
              <p>
                {t("settings.validUntil")}:{" "}
                <span className={leaseIsValid ? "text-emerald-300" : "text-red-300"}>
                  {formatBackupTime(tenantCloud?.leaseValidUntil, t)}
                </span>
              </p>
              {!leaseIsValid ? (
                <p className="text-red-300 pt-1">
                  {t("settings.licenseContact")}
                </p>
              ) : null}
              <button
                type="button"
                onClick={handleRefreshLeaseStatus}
                disabled={cloudBusy}
                className="mt-2 w-full border border-gray-700 text-gray-300 py-2 rounded-lg text-xs font-bold uppercase disabled:opacity-50"
              >
                {t("settings.refreshLicense")}
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
                {t("settings.enableCloudSync")}
              </span>
            </label>
            <Box className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <SyncStat label={t("settings.pendingTotal")} value={String(syncQueueSummary?.total ?? 0)} />
              <SyncStat label={t("settings.syncProducts")} value={String(syncQueueSummary?.products ?? 0)} />
              <SyncStat label={t("settings.syncSales")} value={String(syncQueueSummary?.sales ?? 0)} />
              <SyncStat label={t("settings.syncPurchases")} value={String(syncQueueSummary?.purchases ?? 0)} />
            </Box>
            <Box className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-gray-500">
              <p>
                {t("settings.syncCustomers")}: <span className="text-gray-300">{syncQueueSummary?.customers ?? 0}</span>
              </p>
              <p>
                {t("settings.syncSuppliers")}: <span className="text-gray-300">{syncQueueSummary?.suppliers ?? 0}</span>
              </p>
              <p>
                {t("settings.syncSettings")}: <span className="text-gray-300">{syncQueueSummary?.settings ?? 0}</span>
              </p>
              <p>
                {t("settings.syncSnapshots")}: <span className="text-gray-300">{syncQueueSummary?.stockSnapshots ?? 0}</span>
              </p>
              <p>
                {t("settings.syncCategories")}: <span className="text-gray-300">{syncQueueSummary?.productCategories ?? 0}</span>
              </p>
              <p>
                {t("settings.syncPromotions")}: <span className="text-gray-300">{syncQueueSummary?.promotions ?? 0}</span>
              </p>
            </Box>
            <Box className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleSaveCloudConfig}
                disabled={cloudBusy}
                className="w-full border border-violet-800 bg-violet-950/30 text-violet-300 py-2 rounded-lg text-sm font-bold uppercase disabled:opacity-50"
              >
                {t("settings.saveCloudConfig")}
              </button>
              <button
                type="button"
                onClick={onRefreshSyncQueue}
                disabled={cloudBusy}
                className="w-full border border-gray-700 bg-[#0f0f0f] text-gray-300 py-2 rounded-lg text-sm font-bold uppercase disabled:opacity-50"
              >
                {t("settings.refreshQueue")}
              </button>
              <button
                type="button"
                onClick={handlePushCloudSync}
                disabled={cloudBusy}
                className="w-full border border-blue-800 bg-blue-950/30 text-blue-300 py-2 rounded-lg text-sm font-bold uppercase disabled:opacity-50"
              >
                {cloudBusy ? t("settings.syncing") : t("settings.pushPending")}
              </button>
            </Box>
            <Box className="text-[11px] text-gray-500 space-y-1">
              <p>
                {t("settings.lastSync")}: <span className="text-gray-300">{formatBackupTime(tenantCloud?.lastSyncAt, t)}</span>
              </p>
              <p>
                {t("settings.status")}: <span className="text-gray-300 uppercase">{tenantCloud?.lastSyncStatus ?? "idle"}</span>
              </p>
              {tenantCloud?.lastSyncSummary ? (
                <p>
                  {t("settings.summary")}: <span className="text-gray-300">{tenantCloud.lastSyncSummary}</span>
                </p>
              ) : null}
              {tenantCloud?.lastSyncError ? (
                <p className="text-amber-400">{t("settings.lastError")}: {tError(tenantCloud.lastSyncError)}</p>
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
              {t("settings.backupSection")}
            </p>
            <p className="text-[11px] text-gray-500">
              {t("settings.backupHint")}
            </p>
            <Box className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-500">
              <p>
                {t("settings.lastExport")}:{" "}
                <span className="text-gray-300">
                  {formatBackupTime(backupHistory?.lastExportAt, t)}
                </span>
              </p>
              <p>
                {t("settings.lastRestore")}:{" "}
                <span className="text-gray-300">
                  {formatBackupTime(backupHistory?.lastRestoreAt, t)}
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
                {t("settings.exportBackup")}
              </button>
              <button
                type="button"
                onClick={() => restoreInputRef.current?.click()}
                disabled={backupBusy}
                className="w-full border border-amber-800 bg-amber-950/30 text-amber-400 py-2 rounded-lg text-sm font-bold uppercase disabled:opacity-50"
              >
                {t("settings.restoreBackup")}
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

          {error && <p className="text-red-400 text-sm">{tError(error)}</p>}
          {successMessage && <p className="text-green-400 text-sm">{successMessage}</p>}
          <button
            type="submit"
            disabled={saveBusy}
            className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-bold uppercase disabled:opacity-50"
          >
            {saveBusy ? t("settings.saving") : t("settings.saveAll")}
          </button>
        </form>
      </Box>
    </Box>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}

function formatBackupTime(value, t) {
  if (!value) return t("settings.never");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("settings.unknown");
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

