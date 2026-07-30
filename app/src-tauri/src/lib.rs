mod pdf_security;
mod project_archive;
mod project_manager;
mod project_model;
mod project_storage;
mod receiver;
mod system_fonts;

use project_manager::ProjectManager;
use std::sync::Mutex;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            app.manage(ProjectManager {
                active_workspace: Mutex::new(None),
            });

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                receiver::start_server(handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            project_manager::create_project,
            project_manager::open_project,
            project_manager::save_project,
            project_manager::close_project,
            project_manager::update_project_state,
            system_fonts::get_system_fonts,
            pdf_security::protect_pdf,
            greet
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
