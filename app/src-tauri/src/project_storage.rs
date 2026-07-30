use crate::project_model::ProjectState;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub const PROJECT_STATE_FILENAME: &str = "project.json";

pub fn get_workspace_dir(app: &AppHandle, workspace_id: &str) -> Result<PathBuf, String> {
    let mut path = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    path.push("workspaces");
    path.push(workspace_id);
    Ok(path)
}

pub fn save_state(workspace_dir: &Path, state: &ProjectState) -> Result<(), String> {
    let state_file = workspace_dir.join(PROJECT_STATE_FILENAME);
    let content = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    std::fs::write(state_file, content).map_err(|error| error.to_string())
}

pub fn load_state(workspace_dir: &Path) -> Result<ProjectState, String> {
    let state_file = workspace_dir.join(PROJECT_STATE_FILENAME);
    if !state_file.exists() {
        return Ok(ProjectState::default());
    }
    let content = std::fs::read_to_string(state_file).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{load_state, save_state};
    use crate::project_model::ProjectState;
    use std::fs;
    use uuid::Uuid;

    fn test_workspace() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("storybook-storage-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn state_storage_round_trips_and_rejects_corrupt_json() {
        let workspace = test_workspace();
        let state = ProjectState {
            project_name: "Storage Contract".to_string(),
            ..ProjectState::default()
        };
        save_state(&workspace, &state).unwrap();
        assert_eq!(
            load_state(&workspace).unwrap().project_name,
            "Storage Contract"
        );

        fs::write(workspace.join("project.json"), b"{invalid").unwrap();
        assert!(load_state(&workspace).is_err());
        fs::remove_dir_all(workspace).unwrap();
    }
}
