import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Database, FolderOpen, HardDrive, ImagePlus, Settings, Trash2, X } from "lucide-react";
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
import { isTauriRuntime } from "../db/client";
import {
  DEFAULT_DB_BACKUP_CONFIG,
  loadDatabaseBackupConfig,
  openDatabaseFolder,
  pickDatabaseBackupFolder,
  resolveDefaultBackupDir,
  runDatabaseBackup,
  saveDatabaseBackupConfig,
} from "../utils/databaseBackup";

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
  const [dbBackupConfig, setDbBackupConfig] = useState(() => ({ ...DEFAULT_DB_BACKUP_CONFIG }));
  const [dbBackupBusy, setDbBackupBusy] = useState(false);
  const [dbBackupMessage, setDbBackupMessage] = useState("");
  const [dbBackupMessageOk, setDbBackupMessageOk] = useState(false);
  const isDesktop = isTauriRuntime();
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
    void (async () => {
      const loaded = await loadDatabaseBackupConfig();
      if (!loaded.backupDir && isTauriRuntime()) {
        try {
          loaded.backupDir = await resolveDefaultBackupDir();
        } catch {
          /* ignore */
        }
      }
      setDbBackupConfig(loaded);
    })();
    setDbBackupMessage("");
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

  const setDbBackupField = (key) => (value) => {
    setDbBackupConfig((prev) => ({
      ...prev,
      [key]: typeof value === "function" ? value(prev[key]) : value,
    }));
  };

  const handleDatabaseBackup = async () => {
    if (!isDesktop) {
      setDbBackupMessage(t("settings.databaseBackupDesktopOnly"));
      setDbBackupMessageOk(false);
      return;
    }
    setDbBackupBusy(true);
    setDbBackupMessage("");
    setDbBackupMessageOk(false);
    try {
      const result = await runDatabaseBackup(dbBackupConfig);
      if (!result.ok) {
        setDbBackupMessage(t("settings.databaseBackupDesktopOnly"));
        setDbBackupMessageOk(false);
        return;
      }
      setDbBackupConfig((prev) => ({
        ...prev,
        lastBackupAt: result.lastBackupAt,
        lastBackupPath: result.lastBackupPath,
      }));
      let message = t("settings.databaseBackupOk", { path: result.path });
      if (result.removedOld > 0) {
        message += ` ${t("settings.databaseBackupPruned", { count: result.removedOld })}`;
      }
      setDbBackupMessage(message);
      setDbBackupMessageOk(true);
    } catch (err) {
      setDbBackupMessage(t("settings.databaseBackupFailed", { error: err?.message ?? err }));
      setDbBackupMessageOk(false);
    } finally {
      setDbBackupBusy(false);
    }
  };

  const handleOpenDatabaseFolder = async () => {
    if (!isDesktop) {
      setDbBackupMessage(t("settings.databaseBackupDesktopOnly"));
      setDbBackupMessageOk(false);
      return;
    }
    try {
      await openDatabaseFolder();
    } catch (err) {
      setDbBackupMessage(t("settings.databaseBackupFailed", { error: err?.message ?? err }));
      setDbBackupMessageOk(false);
    }
  };

  const handlePickBackupFolder = async () => {
    if (!isDesktop) return;
    try {
      const result = await pickDatabaseBackupFolder();
      if (result.ok && result.path) {
        setDbBackupField("backupDir")(result.path);
      }
    } catch (err) {
      setDbBackupMessage(t("settings.databaseBackupFailed", { error: err?.message ?? err }));
      setDbBackupMessageOk(false);
    }
  };

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
      if (isDesktop) {
        const dbSave = await saveDatabaseBackupConfig(dbBackupConfig);
        if (!dbSave.ok) {
          setError(t("settings.databaseBackupFailed", { error: dbSave.error ?? "" }));
          return;
        }
      }
      setSuccessMessage(t("settings.saved"));
    } catch (err) {
      setError(t("settings.saveSettingsError", { error: err?.message ?? err }));
    } finally {
      setSaveBusy(false);
    }
  };

  const modal = (
    <Box className="sepela-modal-overlay sepela-modal-overlay--fullscreen">
      <Box
        className="sepela-modal sepela-modal--fullscreen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        <Box className="sepela-modal-header">
          <h3 id="settings-modal-title" className="sepela-modal-title">
            <Settings className="text-sepela-accent" size={22} />
            {t("settings.title")}
          </h3>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="sepela-toolbar-btn text-sepela-muted hover:text-white">
            <X size={22} />
          </button>
        </Box>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <Box className="sepela-modal-body sepela-scroll flex-1">
        <Box className="sepela-settings-content space-y-6">
          <LanguagePicker value={appLanguage} onChange={setAppLanguage} />

          <Box className="sepela-field">
            <label className="sepela-label">{t("settings.primaryCurrency")}</label>
            <Box className="sepela-choice-grid">
              <button
                type="button"
                onClick={() => setCurrency(CURRENCY.CDF)}
                className={`sepela-choice ${currency === CURRENCY.CDF ? "sepela-choice--active" : ""}`}
              >
                <span className="sepela-choice__title">CDF</span>
                <span className="sepela-choice__sub">{t("settings.cdfLabel")}</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrency(CURRENCY.USD)}
                className={`sepela-choice ${currency === CURRENCY.USD ? "sepela-choice--active" : ""}`}
              >
                <span className="sepela-choice__title">USD</span>
                <span className="sepela-choice__sub">{t("settings.usdLabel")}</span>
              </button>
            </Box>
            <p className="sepela-hint">{t("settings.currencyHint")}</p>
          </Box>
          <Box className="sepela-field">
            <label className="sepela-label">{t("settings.exchangeRate")}</label>
            <input
              type="number"
              min="1"
              step="1"
              className="sepela-input sepela-input-lg"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Box>
          <Box className="sepela-panel space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={training}
                onChange={(e) => setTraining(e.target.checked)}
                className="sepela-checkbox"
              />
              <span className="sepela-section-title">{t("settings.trainingMode")}</span>
            </label>
            <p className="sepela-hint">{t("settings.trainingHint")}</p>
          </Box>

          <Box className="sepela-field">
            <label className="sepela-label">{t("settings.expiryWindow")}</label>
            <p className="sepela-hint">{t("settings.expiryHint")}</p>
            <input
              type="number"
              min="1"
              max="365"
              step="1"
              className="sepela-input sepela-input-lg"
              value={alertDays}
              onChange={(e) => setAlertDays(e.target.value)}
            />
          </Box>

          <Box className="sepela-panel space-y-2">
            <p className="sepela-section-title">{t("settings.idleMusicSection")}</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={idleMusicEnabled}
                onChange={(e) => setIdleMusicEnabled(e.target.checked)}
                className="sepela-checkbox"
              />
              <span className="text-sm text-sepela-muted">{t("settings.idleMusicEnabled")}</span>
            </label>
            <label className="sepela-label">{t("settings.idleMusicMinutes")}</label>
            <input
              type="number"
              min={MIN_IDLE_MINUTES}
              max={MAX_IDLE_MINUTES}
              step="1"
              className="sepela-input sepela-input-lg"
              value={idleMusicMinutes}
              onChange={(e) => setIdleMusicMinutes(e.target.value)}
            />
          </Box>

          <Box className="sepela-divider space-y-3">
            <p className="sepela-section-title">
              {t("settings.invoiceSection")}
              {tenantCode ? ` (${tenantCode})` : ""}
            </p>
            {tenantCode ? (
              <p className="sepela-hint">{t("settings.merchantOnly")}</p>
            ) : null}
            <Box className="sepela-panel space-y-3">
              <p className="sepela-label">{t("settings.logoSection")}</p>
              <Box className="flex flex-wrap items-center gap-3">
                {inv.companyLogo ? (
                  <img
                    src={inv.companyLogo}
                    alt={t("settings.logoPreviewAlt")}
                    className="max-h-14 max-w-[120px] object-contain"
                    style={{ background: "transparent" }}
                  />
                ) : (
                  <Box className="flex h-14 w-[120px] items-center justify-center rounded border border-dashed border-sepela-border text-[10px] text-sepela-muted">
                    {t("settings.noLogo")}
                  </Box>
                )}
                <Box className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={logoBusy || saveBusy}
                    onClick={() => logoInputRef.current?.click()}
                    className="sepela-btn-secondary disabled:opacity-50"
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
                      className="sepela-btn-secondary sepela-btn-danger disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      {t("settings.removeLogo")}
                    </button>
                  ) : null}
                </Box>
              </Box>
              <p className="sepela-hint">
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
              className="sepela-input"
              placeholder={t("settings.placeholderCompanyName")}
              value={inv.companyName}
              onChange={setField("companyName")}
            />
            <input
              type="text"
              className="sepela-input"
              placeholder={t("settings.placeholderTagline")}
              value={inv.companyTagline}
              onChange={setField("companyTagline")}
            />
            <input
              type="text"
              className="sepela-input"
              placeholder={t("settings.placeholderAddress1")}
              value={inv.addressLine1}
              onChange={setField("addressLine1")}
            />
            <input
              type="text"
              className="sepela-input"
              placeholder={t("settings.placeholderAddress2")}
              value={inv.addressLine2}
              onChange={setField("addressLine2")}
            />
            <Box className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className="sepela-input"
                placeholder={t("settings.placeholderCity")}
                value={inv.cityProvince}
                onChange={setField("cityProvince")}
              />
              <input
                type="text"
                className="sepela-input"
                placeholder={t("settings.placeholderTax")}
                value={inv.taxId}
                onChange={setField("taxId")}
              />
            </Box>
            <Box className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className="sepela-input"
                placeholder={t("settings.placeholderPhone")}
                value={inv.phone}
                onChange={setField("phone")}
              />
              <input
                type="text"
                className="sepela-input"
                placeholder={t("settings.placeholderEmail")}
                value={inv.email}
                onChange={setField("email")}
              />
            </Box>
            <Box className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className="sepela-input"
                placeholder={t("settings.placeholderInvoiceTitle")}
                value={inv.invoiceTitle}
                onChange={setField("invoiceTitle")}
              />
              <input
                type="text"
                className="sepela-input font-mono"
                placeholder={t("settings.placeholderPrefix")}
                value={inv.invoicePrefix}
                onChange={setField("invoicePrefix")}
              />
            </Box>
            <Box>
              <label className="sepela-label">
                {t("settings.defaultPrintFormat")}
              </label>
              <select
                className="sepela-input mt-1"
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
              className="sepela-input"
              placeholder={t("settings.placeholderSubtitle")}
              value={inv.invoiceSubtitle}
              onChange={setField("invoiceSubtitle")}
            />
            <input
              type="text"
              className="sepela-input"
              placeholder={t("settings.placeholderFooterTitle")}
              value={inv.footerTitle}
              onChange={setField("footerTitle")}
            />
            <textarea
              className="sepela-input min-h-[72px]"
              placeholder={t("settings.placeholderFooterBody")}
              value={inv.footerBody}
              onChange={setField("footerBody")}
            />
          </Box>

          <Box className="sepela-divider space-y-3">
            <p className="sepela-section-title">{t("settings.licenseSection")}</p>
            <Box
              className={`sepela-panel text-[11px] text-sepela-muted space-y-1 ${
                leaseIsValid ? "border-sepela-accent/40" : "border-red-900/40"
              }`}
            >
              <p>
                {t("settings.license")}:{" "}
                <span className={leaseIsValid ? "text-emerald-300" : "text-red-300"}>
                  {leaseIsValid ? t("settings.licenseActive") : t("settings.licenseInactive")}
                </span>
              </p>
              <p>
                {t("settings.merchant")}: <span className="text-white">{tenantCloud?.merchantCode || cloudMerchantCode || "—"}</span>
              </p>
              <p>
                {t("settings.branch")}: <span className="text-white">{tenantCloud?.branchCode || cloudBranchCode || "—"}</span>
              </p>
              <p>
                {t("settings.device")}: <span className="text-white">{tenantCloud?.deviceCode || cloudDeviceCode || "—"}</span>
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
                className="mt-2 sepela-btn-secondary w-full justify-center disabled:opacity-50"
              >
                {t("settings.refreshLicense")}
              </button>
            </Box>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cloudEnabled}
                onChange={(e) => setCloudEnabled(e.target.checked)}
                className="sepela-checkbox"
                disabled={!leaseIsValid}
              />
              <span className="text-sm text-sepela-muted">{t("settings.enableCloudSync")}</span>
            </label>
            <Box className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <SyncStat label={t("settings.pendingTotal")} value={String(syncQueueSummary?.total ?? 0)} />
              <SyncStat label={t("settings.syncProducts")} value={String(syncQueueSummary?.products ?? 0)} />
              <SyncStat label={t("settings.syncSales")} value={String(syncQueueSummary?.sales ?? 0)} />
              <SyncStat label={t("settings.syncPurchases")} value={String(syncQueueSummary?.purchases ?? 0)} />
            </Box>
            <Box className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] sepela-text-secondary">
              <p>
                {t("settings.syncCustomers")}: <span className="sepela-text-muted">{syncQueueSummary?.customers ?? 0}</span>
              </p>
              <p>
                {t("settings.syncSuppliers")}: <span className="sepela-text-muted">{syncQueueSummary?.suppliers ?? 0}</span>
              </p>
              <p>
                {t("settings.syncSettings")}: <span className="sepela-text-muted">{syncQueueSummary?.settings ?? 0}</span>
              </p>
              <p>
                {t("settings.syncSnapshots")}: <span className="sepela-text-muted">{syncQueueSummary?.stockSnapshots ?? 0}</span>
              </p>
              <p>
                {t("settings.syncCategories")}: <span className="sepela-text-muted">{syncQueueSummary?.productCategories ?? 0}</span>
              </p>
              <p>
                {t("settings.syncPromotions")}: <span className="sepela-text-muted">{syncQueueSummary?.promotions ?? 0}</span>
              </p>
            </Box>
            <Box className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleSaveCloudConfig}
                disabled={cloudBusy}
                className="sepela-btn-secondary w-full justify-center disabled:opacity-50"
              >
                {t("settings.saveCloudConfig")}
              </button>
              <button
                type="button"
                onClick={onRefreshSyncQueue}
                disabled={cloudBusy}
                className="sepela-btn-secondary w-full justify-center disabled:opacity-50"
              >
                {t("settings.refreshQueue")}
              </button>
              <button
                type="button"
                onClick={handlePushCloudSync}
                disabled={cloudBusy}
                className="sepela-btn-primary disabled:opacity-50"
              >
                {cloudBusy ? t("settings.syncing") : t("settings.pushPending")}
              </button>
            </Box>
            <Box className="sepela-hint space-y-1">
              <p>
                {t("settings.lastSync")}: <span className="sepela-text-muted">{formatBackupTime(tenantCloud?.lastSyncAt, t)}</span>
              </p>
              <p>
                {t("settings.status")}: <span className="sepela-text-muted">{tenantCloud?.lastSyncStatus ?? "idle"}</span>
              </p>
              {tenantCloud?.lastSyncSummary ? (
                <p>
                  {t("settings.summary")}: <span className="sepela-text-muted">{tenantCloud.lastSyncSummary}</span>
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

          <Box className="sepela-divider space-y-4">
            <p className="sepela-section-title flex items-center gap-2">
              <Database size={14} className="text-sepela-accent" />
              {t("settings.databaseSection")}
            </p>
            {!isDesktop ? (
              <p className="sepela-hint">{t("settings.databaseBackupDesktopOnly")}</p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleDatabaseBackup}
                  disabled={dbBackupBusy || backupBusy}
                  className="sepela-btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <HardDrive size={16} />
                  {t("settings.databaseBackupBtn")}
                </button>
                <button
                  type="button"
                  onClick={handleOpenDatabaseFolder}
                  className="sepela-hint text-sepela-accent hover:text-sepela-accent-hover underline"
                >
                  {t("settings.openDatabaseLocation")}
                </button>
                <p className="sepela-hint">
                  {t("settings.lastDatabaseBackup")}:{" "}
                  <span className="text-white">
                    {formatDatabaseBackupTime(dbBackupConfig.lastBackupAt, t)}
                  </span>
                </p>

                <Box className="sepela-panel space-y-3">
                  <p className="sepela-label">{t("settings.autoBackupSection")}</p>
                  <label className="flex items-center justify-between gap-2 text-xs text-sepela-muted">
                    <span>{t("settings.autoBackupEnabled")}</span>
                    <input
                      type="checkbox"
                      checked={dbBackupConfig.enabled}
                      onChange={(e) => setDbBackupField("enabled")(e.target.checked)}
                      className="sepela-checkbox"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs sepela-text-muted">
                    <span>{t("settings.autoBackupOnStart")}</span>
                    <input
                      type="checkbox"
                      checked={dbBackupConfig.onStart}
                      disabled={!dbBackupConfig.enabled}
                      onChange={(e) => setDbBackupField("onStart")(e.target.checked)}
                      className="sepela-checkbox disabled:opacity-40"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs sepela-text-muted">
                    <span>{t("settings.autoBackupOnClose")}</span>
                    <input
                      type="checkbox"
                      checked={dbBackupConfig.onClose}
                      disabled={!dbBackupConfig.enabled}
                      onChange={(e) => setDbBackupField("onClose")(e.target.checked)}
                      className="sepela-checkbox disabled:opacity-40"
                    />
                  </label>
                  <Box className="space-y-1">
                    <label className="sepela-label">{t("settings.backupLocation")}</label>
                    <Box className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={dbBackupConfig.backupDir || "—"}
                        className="sepela-input flex-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handlePickBackupFolder}
                        disabled={!dbBackupConfig.enabled}
                        className="sepela-btn-secondary disabled:opacity-40"
                        title={t("settings.browseBackupFolder")}
                      >
                        <FolderOpen size={14} />
                      </button>
                    </Box>
                  </Box>
                  <label className="flex items-center justify-between gap-2 text-xs sepela-text-muted">
                    <span>{t("settings.removeOldBackups")}</span>
                    <input
                      type="checkbox"
                      checked={dbBackupConfig.removeOld}
                      disabled={!dbBackupConfig.enabled}
                      onChange={(e) => setDbBackupField("removeOld")(e.target.checked)}
                      className="sepela-checkbox disabled:opacity-40"
                    />
                  </label>
                  <Box className="space-y-1">
                    <label className="sepela-label">{t("settings.retentionDays")}</label>
                    <Box className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!dbBackupConfig.enabled || !dbBackupConfig.removeOld}
                        onClick={() =>
                          setDbBackupField("retentionDays")((days) =>
                            Math.max(1, Number(days) - 1)
                          )
                        }
                        className="sepela-btn-secondary w-8 h-8 justify-center disabled:opacity-40"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        disabled={!dbBackupConfig.enabled || !dbBackupConfig.removeOld}
                        value={dbBackupConfig.retentionDays}
                        onChange={(e) =>
                          setDbBackupField("retentionDays")(
                            Math.min(365, Math.max(1, Number(e.target.value) || 10))
                          )
                        }
                        className="sepela-input flex-1 text-center disabled:opacity-40"
                      />
                      <button
                        type="button"
                        disabled={!dbBackupConfig.enabled || !dbBackupConfig.removeOld}
                        onClick={() =>
                          setDbBackupField("retentionDays")((days) =>
                            Math.min(365, Number(days) + 1)
                          )
                        }
                        className="sepela-btn-secondary w-8 h-8 justify-center disabled:opacity-40"
                      >
                        +
                      </button>
                    </Box>
                  </Box>
                </Box>
                {dbBackupMessage ? (
                  <p className={`text-xs ${dbBackupMessageOk ? "text-green-400" : "text-amber-400"}`}>
                    {dbBackupMessage}
                  </p>
                ) : null}
              </>
            )}
          </Box>

          <Box className="sepela-divider space-y-3">
            <p className="sepela-section-title">{t("settings.dataExportSection")}</p>
            <p className="sepela-hint">{t("settings.backupHint")}</p>
            <Box className="grid grid-cols-1 sm:grid-cols-2 gap-2 sepela-hint">
              <p>
                {t("settings.lastExport")}:{" "}
                <span className="sepela-text-muted">
                  {formatBackupTime(backupHistory?.lastExportAt, t)}
                </span>
              </p>
              <p>
                {t("settings.lastRestore")}:{" "}
                <span className="sepela-text-muted">
                  {formatBackupTime(backupHistory?.lastRestoreAt, t)}
                </span>
              </p>
            </Box>
            <Box className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportBackup}
                disabled={backupBusy}
                className="sepela-btn-secondary w-full justify-center disabled:opacity-50"
              >
                {t("settings.exportBackup")}
              </button>
              <button
                type="button"
                onClick={() => restoreInputRef.current?.click()}
                disabled={backupBusy}
                className="sepela-btn-secondary w-full justify-center disabled:opacity-50"
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

        </Box>
        </Box>
        <Box className="sepela-modal-footer space-y-3">
          {error && <p className="text-red-400 text-sm font-semibold">{tError(error)}</p>}
          {successMessage && <p className="text-green-400 text-sm font-semibold">{successMessage}</p>}
          <button
            type="submit"
            disabled={saveBusy}
            className="sepela-btn-primary max-w-md disabled:opacity-50"
          >
            {saveBusy ? t("settings.saving") : t("settings.saveAll")}
          </button>
        </Box>
        </form>
      </Box>
    </Box>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}

function formatDatabaseBackupTime(value, t) {
  if (!value) return t("settings.never");
  const millis = Number(value);
  const date = Number.isFinite(millis) ? new Date(millis) : new Date(value);
  if (Number.isNaN(date.getTime())) return t("settings.unknown");
  return date.toLocaleString();
}

function formatBackupTime(value, t) {
  if (!value) return t("settings.never");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("settings.unknown");
  return date.toLocaleString();
}

function SyncStat({ label, value }) {
  return (
    <Box className="sepela-panel px-3 py-2">
      <p className="sepela-label">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </Box>
  );
}

