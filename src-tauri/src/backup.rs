use crate::db_path::{resolve_database_file_path, resolve_sepela_data_dir};
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CONFIG_FILE: &str = "backup-config.json";
const BACKUP_PREFIX: &str = "sepela-database-";
const LEGACY_BACKUP_PREFIX: &str = "sepela-backup-";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub on_start: bool,
    #[serde(default = "default_true")]
    pub on_close: bool,
    #[serde(default)]
    pub backup_dir: Option<String>,
    #[serde(default)]
    pub remove_old: bool,
    #[serde(default = "default_retention_days")]
    pub retention_days: u32,
    #[serde(default)]
    pub last_backup_at: Option<String>,
    #[serde(default)]
    pub last_backup_path: Option<String>,
}

fn default_true() -> bool {
    true
}

fn default_retention_days() -> u32 {
    10
}

impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            on_start: true,
            on_close: true,
            backup_dir: None,
            remove_old: false,
            retention_days: default_retention_days(),
            last_backup_at: None,
            last_backup_path: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub path: String,
    pub removed_old: u32,
}

fn config_path() -> Result<PathBuf, String> {
    Ok(resolve_sepela_data_dir()?.join(CONFIG_FILE))
}

pub fn load_backup_config() -> Result<BackupConfig, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(BackupConfig::default());
    }
    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

pub fn save_backup_config(config: &BackupConfig) -> Result<(), String> {
    let path = config_path()?;
    let raw = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
}

pub fn default_backup_dir() -> Result<PathBuf, String> {
    Ok(resolve_sepela_data_dir()?.join("backups"))
}

pub fn resolve_backup_dir(config: &BackupConfig) -> Result<PathBuf, String> {
    if let Some(dir) = config.backup_dir.as_ref() {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    default_backup_dir()
}

fn backup_stamp(backup_dir: &Path) -> String {
    let stamp = Local::now().format("%Y-%m-%d-%H-%M").to_string();
    let mut name = format!("{BACKUP_PREFIX}{stamp}.db");
    let mut counter = 2;
    while backup_dir.join(&name).exists() {
        name = format!("{BACKUP_PREFIX}{stamp}-{counter}.db");
        counter += 1;
    }
    name
}

fn copy_database_bundle(source_db: &Path, dest_db: &Path) -> Result<(), String> {
    fs::copy(source_db, dest_db).map_err(|error| {
        format!(
            "Failed to copy database to {}: {error}",
            dest_db.display()
        )
    })?;

    let source_display = source_db.to_string_lossy();
    let dest_display = dest_db.to_string_lossy();
    for suffix in ["-wal", "-shm"] {
        let source_sidecar = PathBuf::from(format!("{source_display}{suffix}"));
        if source_sidecar.exists() {
            let dest_sidecar = PathBuf::from(format!("{dest_display}{suffix}"));
            fs::copy(&source_sidecar, &dest_sidecar).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn is_sepela_backup_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("db"))
        .unwrap_or(false)
        && path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.starts_with(BACKUP_PREFIX) || value.starts_with(LEGACY_BACKUP_PREFIX))
            .unwrap_or(false)
}

pub fn prune_old_backups(dir: &Path, retention_days: u32) -> Result<u32, String> {
    if retention_days == 0 || !dir.exists() {
        return Ok(0);
    }

    let cutoff = SystemTime::now()
        .checked_sub(Duration::from_secs(retention_days as u64 * 86_400))
        .unwrap_or(UNIX_EPOCH);

    let mut removed = 0u32;
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !is_sepela_backup_file(&path) {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        if modified >= cutoff {
            continue;
        }

        fs::remove_file(&path).map_err(|error| error.to_string())?;
        let path_display = path.to_string_lossy();
        for suffix in ["-wal", "-shm"] {
            let sidecar = PathBuf::from(format!("{path_display}{suffix}"));
            if sidecar.exists() {
                let _ = fs::remove_file(sidecar);
            }
        }
        removed += 1;
    }

    Ok(removed)
}

pub fn run_database_backup(mut config: BackupConfig) -> Result<BackupResult, String> {
    let source_db = resolve_database_file_path()?;
    if !source_db.exists() {
        return Err("Database file was not found.".into());
    }

    let backup_dir = resolve_backup_dir(&config)?;
    fs::create_dir_all(&backup_dir).map_err(|error| {
        format!(
            "Failed to create backup folder {}: {error}",
            backup_dir.display()
        )
    })?;

    let file_name = backup_stamp(&backup_dir);
    let dest_db = backup_dir.join(&file_name);
    copy_database_bundle(&source_db, &dest_db)?;

    let removed_old = if config.remove_old {
        prune_old_backups(&backup_dir, config.retention_days)?
    } else {
        0
    };

    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
    config.last_backup_at = Some(millis.to_string());
    config.last_backup_path = Some(dest_db.to_string_lossy().into_owned());
    save_backup_config(&config)?;

    Ok(BackupResult {
        path: dest_db.to_string_lossy().into_owned(),
        removed_old,
    })
}

pub fn maybe_auto_backup(trigger: &str) -> Result<Option<BackupResult>, String> {
    let config = load_backup_config()?;
    if !config.enabled {
        return Ok(None);
    }
    let should_run = match trigger {
        "start" => config.on_start,
        "close" => config.on_close,
        _ => false,
    };
    if !should_run {
        return Ok(None);
    }
    Ok(Some(run_database_backup(config)?))
}
