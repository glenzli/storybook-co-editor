use crate::project_archive;
use crate::project_model::ProjectState;
use crate::project_storage;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

pub struct ProjectManager {
    pub active_workspace: Mutex<Option<String>>,
}

#[derive(Serialize)]
pub struct ProjectInfo {
    pub workspace_id: String,
    pub state: ProjectState,
}

#[tauri::command]
pub fn create_project(
    app: AppHandle,
    manager: State<ProjectManager>,
) -> Result<ProjectInfo, String> {
    let workspace_id = Uuid::new_v4().to_string();
    let workspace_dir = project_storage::get_workspace_dir(&app, &workspace_id)?;

    std::fs::create_dir_all(&workspace_dir).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(workspace_dir.join("images")).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(workspace_dir.join("trash")).map_err(|error| error.to_string())?;

    let state = ProjectState::default();
    project_storage::save_state(&workspace_dir, &state)?;
    *manager.active_workspace.lock().unwrap() = Some(workspace_id.clone());

    Ok(ProjectInfo {
        workspace_id,
        state,
    })
}

#[tauri::command]
pub async fn open_project(
    app: AppHandle,
    manager: State<'_, ProjectManager>,
    archive_path: String,
) -> Result<ProjectInfo, String> {
    let workspace_id = Uuid::new_v4().to_string();
    let workspace_dir = project_storage::get_workspace_dir(&app, &workspace_id)?;
    std::fs::create_dir_all(&workspace_dir).map_err(|error| error.to_string())?;

    project_archive::extract(&archive_path, &workspace_dir)?;
    let state = project_storage::load_state(&workspace_dir)?;
    *manager.active_workspace.lock().unwrap() = Some(workspace_id.clone());

    Ok(ProjectInfo {
        workspace_id,
        state,
    })
}

#[tauri::command]
pub async fn save_project(
    app: AppHandle,
    manager: State<'_, ProjectManager>,
    target_path: String,
) -> Result<(), String> {
    let active_workspace = manager.active_workspace.lock().unwrap().clone();
    let workspace_id = active_workspace.ok_or_else(|| "No active project".to_string())?;
    let workspace_dir = project_storage::get_workspace_dir(&app, &workspace_id)?;
    project_archive::write(&workspace_dir, &target_path, |current, total| {
        let _ = app.emit(
            "save-progress",
            serde_json::json!({ "current": current, "total": total }),
        );
    })
}

#[tauri::command]
pub fn close_project(manager: State<ProjectManager>) -> Result<(), String> {
    *manager.active_workspace.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub fn update_project_state(
    app: AppHandle,
    manager: State<ProjectManager>,
    state: ProjectState,
) -> Result<(), String> {
    let active_workspace = manager.active_workspace.lock().unwrap().clone();
    let workspace_id = active_workspace.ok_or_else(|| "No active project".to_string())?;
    let workspace_dir = project_storage::get_workspace_dir(&app, &workspace_id)?;
    project_storage::save_state(&workspace_dir, &state)
}
