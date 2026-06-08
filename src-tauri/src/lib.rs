// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod db_path;

use db_path::{database_connection_uri, migrate_legacy_database_if_needed, resolve_database_file_path};
use tauri::Manager;
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
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            sepela_database_connection_uri,
            sepela_database_file_path
        ])
        .setup(|app| {
            if let Err(error) = migrate_legacy_database_if_needed() {
                eprintln!("Sepela ERP database migration warning: {error}");
            }
            apply_window_icon(app);
            #[cfg(not(debug_assertions))]
            harden_all_webview_windows(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
