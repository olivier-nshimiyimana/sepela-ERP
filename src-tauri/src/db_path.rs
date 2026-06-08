use std::fs;
use std::path::{Path, PathBuf};

const PRIMARY_DATA_DIR: &str = r"D:\SepelaERP\data";
const FALLBACK_DATA_DIR: &str = r"C:\SepelaERP\data";
const DB_FILE_NAME: &str = "sepela.db";

#[cfg(windows)]
fn drive_letter_exists(letter: char) -> bool {
    Path::new(&format!("{}:\\", letter.to_ascii_uppercase())).exists()
}

#[cfg(not(windows))]
fn drive_letter_exists(_letter: char) -> bool {
    false
}

fn ensure_data_dir(path: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(path).map_err(|error| {
        format!(
            "Failed to create database directory {}: {error}",
            path.display()
        )
    })?;
    Ok(path.to_path_buf())
}

/// Prefer D:\SepelaERP\data; fall back to C:\SepelaERP\data when D: is unavailable.
pub fn resolve_sepela_data_dir() -> Result<PathBuf, String> {
    if drive_letter_exists('D') {
        if let Ok(dir) = ensure_data_dir(Path::new(PRIMARY_DATA_DIR)) {
            return Ok(dir);
        }
    }
    ensure_data_dir(Path::new(FALLBACK_DATA_DIR))
}

pub fn resolve_database_file_path() -> Result<PathBuf, String> {
    Ok(resolve_sepela_data_dir()?.join(DB_FILE_NAME))
}

pub fn database_connection_uri() -> Result<String, String> {
    let db_path = resolve_database_file_path()?;
    let normalized = db_path.to_string_lossy().replace('\\', "/");
    Ok(format!("sqlite:{normalized}"))
}

/// One-time copy from legacy %APPDATA%\com.sepela.erp\sepela.db when the new file is missing.
#[cfg(windows)]
pub fn migrate_legacy_database_if_needed() -> Result<(), String> {
    let target = resolve_database_file_path()?;
    if target.exists() {
        return Ok(());
    }

    let appdata = std::env::var("APPDATA").map_err(|error| error.to_string())?;
    let legacy = Path::new(&appdata)
        .join("com.sepela.erp")
        .join(DB_FILE_NAME);
    if !legacy.exists() {
        return Ok(());
    }

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::copy(&legacy, &target).map_err(|error| {
        format!(
            "Failed to migrate legacy database from {} to {}: {error}",
            legacy.display(),
            target.display()
        )
    })?;
    Ok(())
}

#[cfg(not(windows))]
pub fn migrate_legacy_database_if_needed() -> Result<(), String> {
    Ok(())
}
