// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod backup;
mod db_path;

use backup::{
    default_backup_dir, load_backup_config, maybe_auto_backup, run_database_backup, save_backup_config,
    BackupConfig, BackupResult,
};
use db_path::{
    database_connection_uri, migrate_legacy_database_if_needed, resolve_database_file_path,
    resolve_sepela_data_dir,
};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
#[cfg(not(debug_assertions))]
use tauri::WebviewWindow;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn sepela_database_connection_uri() -> Result<String, String> {
    database_connection_uri()
}

#[tauri::command]
fn sepela_database_file_path() -> Result<String, String> {
    Ok(resolve_database_file_path()?.to_string_lossy().into_owned())
}

#[tauri::command]
fn sepela_database_folder_path() -> Result<String, String> {
    Ok(resolve_sepela_data_dir()?.to_string_lossy().into_owned())
}

#[tauri::command]
fn sepela_default_backup_dir() -> Result<String, String> {
    Ok(default_backup_dir()?.to_string_lossy().into_owned())
}

#[tauri::command]
fn sepela_get_backup_config() -> Result<BackupConfig, String> {
    load_backup_config()
}

#[tauri::command]
fn sepela_save_backup_config(config: BackupConfig) -> Result<(), String> {
    save_backup_config(&config)
}

#[tauri::command]
fn sepela_backup_database(config: Option<BackupConfig>) -> Result<BackupResult, String> {
    let config = match config {
        Some(value) => {
            save_backup_config(&value)?;
            value
        }
        None => load_backup_config()?,
    };
    run_database_backup(config)
}

#[tauri::command]
async fn sepela_open_database_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = resolve_sepela_data_dir()?;
    app.opener()
        .open_path(dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|error| error.to_string())
}

fn apply_window_icon(app: &tauri::App) {
    let Some(icon) = app.default_window_icon() else {
        return;
    };
    for (label, window) in app.webview_windows() {
        let _ = window.set_icon(icon.clone());
        let _ = label;
    }
}

#[cfg(not(debug_assertions))]
const PRODUCTION_INIT_SCRIPT: &str = include_str!("../scripts/production-harden.js");

#[cfg(not(debug_assertions))]
fn harden_production_window(window: &WebviewWindow) {
    let _ = window.eval(PRODUCTION_INIT_SCRIPT);
}

#[cfg(not(debug_assertions))]
fn harden_all_webview_windows(app: &tauri::App) {
    for (_, window) in app.webview_windows() {
        harden_production_window(&window);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            sepela_database_connection_uri,
            sepela_database_file_path,
            sepela_database_folder_path,
            sepela_default_backup_dir,
            sepela_get_backup_config,
            sepela_save_backup_config,
            sepela_backup_database,
            sepela_open_database_folder
        ])
        .setup(|app| {
            if let Err(error) = migrate_legacy_database_if_needed() {
                eprintln!("Sepela ERP database migration warning: {error}");
            }
            if let Err(error) = maybe_auto_backup("start") {
                eprintln!("Sepela ERP startup backup warning: {error}");
            }
            apply_window_icon(app);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.maximize();
                let _ = window.set_background_color(Some(tauri::webview::Color(0x1a, 0x1a, 0x1a, 0xff)));
            }
            #[cfg(not(debug_assertions))]
            harden_all_webview_windows(app);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Err(error) = maybe_auto_backup("close") {
                    eprintln!("Sepela ERP close backup warning: {error}");
                }
                let _ = window;
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
