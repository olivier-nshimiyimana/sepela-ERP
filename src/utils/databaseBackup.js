import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauriRuntime } from "../db/client";

export const DEFAULT_DB_BACKUP_CONFIG = {
  enabled: false,
  onStart: true,
  onClose: true,
  backupDir: "",
  removeOld: false,
  retentionDays: 10,
  lastBackupAt: null,
  lastBackupPath: null,
};

function fromRustConfig(raw = {}) {
  return {
    enabled: !!raw.enabled,
    onStart: raw.onStart !== false,
    onClose: raw.onClose !== false,
    backupDir: raw.backupDir ?? "",
    removeOld: !!raw.removeOld,
    retentionDays: Number(raw.retentionDays) > 0 ? Number(raw.retentionDays) : 10,
    lastBackupAt: raw.lastBackupAt ?? null,
    lastBackupPath: raw.lastBackupPath ?? null,
  };
}

function toRustConfig(config) {
  return {
    enabled: !!config.enabled,
    onStart: !!config.onStart,
    onClose: !!config.onClose,
    backupDir: String(config.backupDir ?? "").trim() || null,
    removeOld: !!config.removeOld,
    retentionDays: Math.min(365, Math.max(1, Number.parseInt(String(config.retentionDays), 10) || 10)),
    lastBackupAt: config.lastBackupAt ?? null,
    lastBackupPath: config.lastBackupPath ?? null,
  };
}

export async function loadDatabaseBackupConfig() {
  if (!isTauriRuntime()) return { ...DEFAULT_DB_BACKUP_CONFIG };
  const raw = await invoke("sepela_get_backup_config");
  return fromRustConfig(raw);
}

export async function saveDatabaseBackupConfig(config) {
  if (!isTauriRuntime()) {
    return { ok: false, error: "databaseBackup.desktopOnly" };
  }
  await invoke("sepela_save_backup_config", { config: toRustConfig(config) });
  return { ok: true };
}

export async function runDatabaseBackup(config) {
  if (!isTauriRuntime()) {
    return { ok: false, error: "databaseBackup.desktopOnly" };
  }
  const result = await invoke("sepela_backup_database", {
    config: config ? toRustConfig(config) : null,
  });
  return {
    ok: true,
    path: result.path,
    removedOld: result.removedOld ?? 0,
    lastBackupAt: String(Date.now()),
    lastBackupPath: result.path,
  };
}

export async function openDatabaseFolder() {
  if (!isTauriRuntime()) {
    return { ok: false, error: "databaseBackup.desktopOnly" };
  }
  await invoke("sepela_open_database_folder");
  return { ok: true };
}

export async function pickDatabaseBackupFolder() {
  if (!isTauriRuntime()) {
    return { ok: false, error: "databaseBackup.desktopOnly" };
  }
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select backup folder",
  });
  if (!selected) return { ok: true, path: null };
  return { ok: true, path: String(selected) };
}

export async function resolveDefaultBackupDir() {
  if (!isTauriRuntime()) return "";
  return invoke("sepela_default_backup_dir");
}
