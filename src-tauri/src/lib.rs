// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;
#[cfg(not(debug_assertions))]
use tauri::WebviewWindow;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            apply_window_icon(app);
            #[cfg(not(debug_assertions))]
            harden_all_webview_windows(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
