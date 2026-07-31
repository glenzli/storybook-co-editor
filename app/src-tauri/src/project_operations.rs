use crate::project_manager::ProjectManager;
use crate::project_model::{PageTextOverride, ProjectState};
use crate::project_storage;
use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

const EXTERNAL_PROJECT_UPDATE_EVENT: &str = "external-project-update";

#[derive(Clone, Serialize)]
pub struct ActiveProjectSnapshot {
    pub workspace_id: String,
    pub state: ProjectState,
}

#[derive(Clone, Serialize)]
struct ExternalProjectUpdate {
    workspace_id: String,
    state: ProjectState,
    source: String,
}

fn active_workspace_id(manager: &ProjectManager) -> Result<String, String> {
    manager
        .active_workspace
        .lock()
        .map_err(|_| "PROJECT_LOCK_POISONED".to_string())?
        .clone()
        .ok_or_else(|| "NO_ACTIVE_PROJECT".to_string())
}

fn load_active_unlocked(
    app: &AppHandle,
    manager: &ProjectManager,
) -> Result<ActiveProjectSnapshot, String> {
    let workspace_id = active_workspace_id(manager)?;
    let workspace_dir = project_storage::get_workspace_dir(app, &workspace_id)?;
    let state = project_storage::load_state(&workspace_dir)?;
    Ok(ActiveProjectSnapshot {
        workspace_id,
        state,
    })
}

pub fn load_active_project(
    app: &AppHandle,
    manager: &ProjectManager,
) -> Result<ActiveProjectSnapshot, String> {
    let _guard = manager
        .operation_lock
        .lock()
        .map_err(|_| "PROJECT_LOCK_POISONED".to_string())?;
    load_active_unlocked(app, manager)
}

pub fn save_frontend_state(
    app: &AppHandle,
    manager: &ProjectManager,
    state: ProjectState,
) -> Result<(), String> {
    let _guard = manager
        .operation_lock
        .lock()
        .map_err(|_| "PROJECT_LOCK_POISONED".to_string())?;
    let current = load_active_unlocked(app, manager)?;

    let incoming_modified = DateTime::parse_from_rfc3339(&state.last_modified).ok();
    let current_modified = DateTime::parse_from_rfc3339(&current.state.last_modified).ok();
    if incoming_modified
        .zip(current_modified)
        .is_some_and(|(incoming, stored)| incoming < stored)
    {
        return Err("STALE_PROJECT_STATE".to_string());
    }

    let workspace_dir = project_storage::get_workspace_dir(app, &current.workspace_id)?;
    project_storage::save_state(&workspace_dir, &state)
}

fn update_active_project<F>(
    app: &AppHandle,
    manager: &ProjectManager,
    expected_last_modified: &str,
    source: &str,
    update: F,
) -> Result<ActiveProjectSnapshot, String>
where
    F: FnOnce(&mut ProjectState) -> Result<(), String>,
{
    let _guard = manager
        .operation_lock
        .lock()
        .map_err(|_| "PROJECT_LOCK_POISONED".to_string())?;
    let mut snapshot = load_active_unlocked(app, manager)?;

    if snapshot.state.last_modified != expected_last_modified {
        return Err(format!(
            "PROJECT_CONFLICT: expected {}, current {}",
            expected_last_modified, snapshot.state.last_modified
        ));
    }

    update(&mut snapshot.state)?;
    snapshot.state.last_modified = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let workspace_dir = project_storage::get_workspace_dir(app, &snapshot.workspace_id)?;
    project_storage::save_state(&workspace_dir, &snapshot.state)?;

    app.emit(
        EXTERNAL_PROJECT_UPDATE_EVENT,
        ExternalProjectUpdate {
            workspace_id: snapshot.workspace_id.clone(),
            state: snapshot.state.clone(),
            source: source.to_string(),
        },
    )
    .map_err(|error| error.to_string())?;

    Ok(snapshot)
}

pub fn replace_story_script(
    app: &AppHandle,
    manager: &ProjectManager,
    expected_last_modified: &str,
    script: String,
    source: &str,
) -> Result<ActiveProjectSnapshot, String> {
    validate_story_script(&script)?;
    update_active_project(app, manager, expected_last_modified, source, move |state| {
        state.global_script = script;
        Ok(())
    })
}

pub fn set_page_text_position(
    app: &AppHandle,
    manager: &ProjectManager,
    expected_last_modified: &str,
    page_index: usize,
    offset_x: f64,
    offset_y: f64,
    source: &str,
) -> Result<ActiveProjectSnapshot, String> {
    update_active_project(app, manager, expected_last_modified, source, move |state| {
        if page_index >= state.visible_images.len() {
            return Err(format!(
                "PAGE_OUT_OF_RANGE: page {} does not exist",
                page_index
            ));
        }

        let max_x = f64::from(state.canvas_width);
        let max_y = f64::from(state.canvas_height);
        if !offset_x.is_finite()
            || !offset_y.is_finite()
            || offset_x.abs() > max_x
            || offset_y.abs() > max_y
        {
            return Err(format!(
                "INVALID_TEXT_POSITION: offsets must stay within +/-{} x +/-{} px",
                state.canvas_width, state.canvas_height
            ));
        }

        let override_entry = state
            .page_text_overrides
            .entry(page_index.to_string())
            .or_insert_with(PageTextOverride::default);
        override_entry.offset_x = offset_x;
        override_entry.offset_y = offset_y;
        Ok(())
    })
}

pub fn validate_story_script(script: &str) -> Result<(), String> {
    if script.trim().is_empty() {
        return Err("EMPTY_STORY_SCRIPT".to_string());
    }

    let mut invalid = Vec::new();
    for (index, line) in script.lines().enumerate() {
        let trimmed = line.trim();
        if !trimmed.starts_with('[') {
            continue;
        }
        let Some(end) = trimmed.find(']') else {
            continue;
        };
        let tag = &trimmed[1..end];
        let normalized = tag.to_ascii_lowercase();
        let valid = matches!(normalized.as_str(), "cover" | "title" | "author")
            || matches!(tag, "封面" | "扉页" | "作者")
            || !tag.is_empty() && tag.chars().all(|character| character.is_ascii_digit());
        if !valid {
            invalid.push(format!("line {}: [{}]", index + 1, tag));
        }
    }

    if invalid.is_empty() {
        Ok(())
    } else {
        Err(format!("INVALID_STORY_TAGS: {}", invalid.join(", ")))
    }
}

pub fn story_tag_sequence(script: &str) -> Vec<String> {
    script
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if !trimmed.starts_with('[') {
                return None;
            }
            let end = trimmed.find(']')?;
            Some(trimmed[..=end].to_string())
        })
        .collect()
}

pub fn active_project_from_app(app: &AppHandle) -> Result<ActiveProjectSnapshot, String> {
    let manager = app.state::<ProjectManager>();
    load_active_project(app, &manager)
}

#[cfg(test)]
mod tests {
    use super::validate_story_script;

    #[test]
    fn accepts_supported_bilingual_tags() {
        let script = "[封面]\n标题\n\n[Title]\n副标题\n\n[12]\n正文\n\n[作者]\n姓名";
        assert!(validate_story_script(script).is_ok());
    }

    #[test]
    fn rejects_unknown_tags_and_empty_scripts() {
        assert!(validate_story_script("[Unknown]\nText").is_err());
        assert!(validate_story_script("  ").is_err());
    }

    #[test]
    fn extracts_tags_in_document_order() {
        assert_eq!(
            super::story_tag_sequence("[Cover]\nA\n\n[1]\nB\n\n[Author]\nC"),
            vec!["[Cover]", "[1]", "[Author]"]
        );
    }
}
