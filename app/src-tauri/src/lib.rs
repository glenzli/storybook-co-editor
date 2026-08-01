mod codex_app_server;
mod codex_image_edit;
mod codex_mcp_config;
mod codex_polish;
mod mcp_server;
mod pdf_security;
mod project_archive;
mod project_manager;
mod project_model;
mod project_operations;
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
            app.manage(mcp_server::McpTokenState::default());
            app.manage(ProjectManager {
                active_workspace: Mutex::new(None),
                operation_lock: Mutex::new(()),
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
            mcp_server::get_mcp_connection_info,
            mcp_server::rotate_mcp_access_token,
            codex_mcp_config::install_mcp_into_codex,
            codex_polish::list_codex_models,
            codex_polish::polish_story_with_codex,
            codex_image_edit::redraw_image_with_codex,
            codex_image_edit::create_image_with_codex,
            codex_image_edit::apply_codex_image_variant,
            codex_image_edit::append_codex_image,
            codex_image_edit::discard_codex_image_variant,
            system_fonts::get_system_fonts,
            pdf_security::protect_pdf,
            greet
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
