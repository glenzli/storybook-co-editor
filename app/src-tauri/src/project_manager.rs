use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;
use walkdir::WalkDir;
use zip::write::FileOptions;
use zip::{ZipArchive, ZipWriter};
use font_kit::source::SystemSource;

#[derive(Serialize, Deserialize, Clone)]
pub struct TextSettings {
    pub font_family: String,
    pub font_size: f32,
    pub text_color: String,
    pub has_shadow: bool,
    pub offset_x: f32,
    pub offset_y: f32,
}

impl Default for TextSettings {
    fn default() -> Self {
        Self {
            font_family: "serif".to_string(),
            font_size: 20.0,
            text_color: "#ffffff".to_string(),
            has_shadow: true,
            offset_x: 0.0,
            offset_y: 0.0,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProjectState {
    pub project_name: String,
    pub last_modified: String,
    pub visible_images: Vec<String>,
    pub trashed_images: Vec<String>,
    pub global_script: String,
    #[serde(default)]
    pub cover_text_settings: TextSettings,
    #[serde(default)]
    pub inner_text_settings: TextSettings,
}

impl Default for ProjectState {
    fn default() -> Self {
        Self {
            project_name: "Untitled".to_string(),
            last_modified: chrono::Utc::now().to_rfc3339(),
            visible_images: vec![],
            trashed_images: vec![],
            global_script: "".to_string(),
            cover_text_settings: TextSettings { font_size: 40.0, ..TextSettings::default() },
            inner_text_settings: TextSettings::default(),
        }
    }
}

pub struct ProjectManager {
    pub active_workspace: Mutex<Option<String>>,
}

#[derive(Serialize)]
pub struct ProjectInfo {
    pub workspace_id: String,
    pub state: ProjectState,
}

#[tauri::command]
pub fn create_project(app: AppHandle, manager: State<ProjectManager>) -> Result<ProjectInfo, String> {
    let workspace_id = Uuid::new_v4().to_string();
    let workspace_dir = get_workspace_dir(&app, &workspace_id)?;

    std::fs::create_dir_all(&workspace_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(workspace_dir.join("images")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(workspace_dir.join("trash")).map_err(|e| e.to_string())?;

    let state = ProjectState::default();
    save_state_to_disk(&workspace_dir, &state)?;

    *manager.active_workspace.lock().unwrap() = Some(workspace_id.clone());

    Ok(ProjectInfo {
        workspace_id,
        state,
    })
}

#[tauri::command]
pub fn open_project(app: AppHandle, manager: State<ProjectManager>, archive_path: String) -> Result<ProjectInfo, String> {
    let workspace_id = Uuid::new_v4().to_string();
    let workspace_dir = get_workspace_dir(&app, &workspace_id)?;

    std::fs::create_dir_all(&workspace_dir).map_err(|e| e.to_string())?;

    // Unzip the archive
    let file = File::open(&archive_path).map_err(|e| format!("Failed to open archive: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Failed to read archive: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).unwrap();
        let outpath = match file.enclosed_name() {
            Some(path) => workspace_dir.join(path),
            None => continue,
        };

        if (*file.name()).ends_with('/') {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    let state = load_state_from_disk(&workspace_dir)?;
    *manager.active_workspace.lock().unwrap() = Some(workspace_id.clone());

    Ok(ProjectInfo {
        workspace_id,
        state,
    })
}

#[tauri::command]
pub fn save_project(app: AppHandle, manager: State<ProjectManager>, target_path: String) -> Result<(), String> {
    let active = manager.active_workspace.lock().unwrap().clone();
    if let Some(workspace_id) = active {
        let workspace_dir = get_workspace_dir(&app, &workspace_id)?;
        
        let file = File::create(&target_path).map_err(|e| e.to_string())?;
        let mut zip = ZipWriter::new(file);
        let options = FileOptions::<()>::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o755);

        let walkdir = WalkDir::new(&workspace_dir);
        let it = walkdir.into_iter();

        for entry in it.filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = path.strip_prefix(&workspace_dir).unwrap();
            let name_str = name.to_str().unwrap().replace("\\", "/");

            if path.is_file() {
                zip.start_file(name_str, options).map_err(|e| e.to_string())?;
                let mut f = File::open(path).map_err(|e| e.to_string())?;
                std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
            } else if path.is_dir() && !name_str.is_empty() {
                zip.add_directory(name_str, options).map_err(|e| e.to_string())?;
            }
        }
        zip.finish().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("No active project".to_string())
    }
}

#[tauri::command]
pub fn close_project(manager: State<ProjectManager>) -> Result<(), String> {
    *manager.active_workspace.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub fn update_project_state(app: AppHandle, manager: State<ProjectManager>, state: ProjectState) -> Result<(), String> {
    let active = manager.active_workspace.lock().unwrap().clone();
    if let Some(workspace_id) = active {
        let workspace_dir = get_workspace_dir(&app, &workspace_id)?;
        save_state_to_disk(&workspace_dir, &state)?;
        Ok(())
    } else {
        Err("No active project".to_string())
    }
}

#[tauri::command]
pub fn get_system_fonts() -> Result<Vec<String>, String> {
    let source = SystemSource::new();
    let mut fonts = source.all_families().unwrap_or_default();
    fonts.sort();
    fonts.dedup();
    Ok(fonts)
}

pub fn get_workspace_dir(app: &AppHandle, workspace_id: &str) -> Result<PathBuf, String> {
    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    path.push("workspaces");
    path.push(workspace_id);
    Ok(path)
}

fn save_state_to_disk(workspace_dir: &Path, state: &ProjectState) -> Result<(), String> {
    let state_file = workspace_dir.join("project.json");
    let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(&state_file, content).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_state_from_disk(workspace_dir: &Path) -> Result<ProjectState, String> {
    let state_file = workspace_dir.join("project.json");
    if state_file.exists() {
        let content = std::fs::read_to_string(&state_file).map_err(|e| e.to_string())?;
        let state: ProjectState = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(state)
    } else {
        Ok(ProjectState::default())
    }
}
