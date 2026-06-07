mod project_manager;

use axum::{
    routing::{get, post},
    Router,
    Json,
    extract::{State, DefaultBodyLimit, Path as AxumPath},
    body::Body,
    response::IntoResponse,
    http::{StatusCode, header},
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Emitter};
use tower_http::cors::{Any, CorsLayer};
use sha2::{Sha256, Digest};
use uuid::Uuid;

use project_manager::{ProjectManager, ProjectState, ProjectInfo};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Deserialize)]
struct SaveImageRequest {
    url: Option<String>,
    page: Option<u32>,
    base64_data: Option<String>,
}

#[derive(Deserialize)]
struct BatchStartRequest {
    total: u32,
}

#[derive(Serialize)]
struct ProjectStateResponse {
    success: bool,
    state: Option<ProjectState>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct UpdateProjectStateRequest {
    state: ProjectState,
}

#[derive(Deserialize)]
struct TrashImageRequest {
    filepath: String,
}

#[derive(Deserialize)]
struct LogRequest {
    level: String,
    message: String,
    source: String,
}

#[derive(Serialize)]
struct GenericResponse {
    success: bool,
    error: Option<String>,
}

#[derive(Serialize)]
struct SaveImageResponse {
    success: bool,
    status: Option<String>,
    filepath: Option<String>,
    error: Option<String>,
}

struct AppState {
    app_handle: AppHandle,
    is_cancelled: Mutex<bool>,
}

// Dynamically gets or creates the active workspace directory
fn get_or_create_active_workspace(app_handle: &AppHandle) -> Result<std::path::PathBuf, String> {
    let manager = app_handle.state::<ProjectManager>();
    let active_id = manager.active_workspace.lock().unwrap().clone();
    
    if let Some(ws_id) = active_id {
        project_manager::get_workspace_dir(app_handle, &ws_id)
    } else {
        // Auto-create an Untitled project if none is active
        let info = project_manager::create_project(app_handle.clone(), manager).map_err(|e| e.to_string())?;
        
        // Notify frontend that a new project was auto-created
        let _ = app_handle.emit("project-auto-created", serde_json::json!({
            "workspace_id": info.workspace_id.clone()
        }));
        
        project_manager::get_workspace_dir(app_handle, &info.workspace_id)
    }
}

async fn start_server(app_handle: AppHandle) {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let state = Arc::new(AppState { 
        app_handle,
        is_cancelled: Mutex::new(false),
    });

    let app = Router::new()
        .route("/api/save-image", post(save_image))
        .route("/api/start-batch", post(start_batch))
        .route("/api/cancel-batch", post(cancel_batch))
        .route("/api/project/state", axum::routing::get(get_project_state))
        .route("/api/project/state", post(update_project_state))
        .route("/api/list-images", axum::routing::get(list_images))
        .route("/api/trash-image", post(trash_image))
        .route("/api/restore-trash", post(restore_trash))
        .route("/api/list-trash", axum::routing::get(list_trash))
        .route("/api/log", post(receive_log))
        .route("/images/{filename}", axum::routing::get(serve_image))
        .layer(cors)
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:14320").await.unwrap();
    println!("Local server listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}

async fn serve_image(
    State(state): State<Arc<AppState>>,
    AxumPath(filename): AxumPath<String>,
) -> impl IntoResponse {
    let ws_dir = match get_or_create_active_workspace(&state.app_handle) {
        Ok(dir) => dir,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "No workspace".to_string()).into_response(),
    };
    
    let path = ws_dir.join(&filename);
    if !path.exists() {
        return (StatusCode::NOT_FOUND, "Not found".to_string()).into_response();
    }
    
    let bytes = match tokio::fs::read(&path).await {
        Ok(b) => b,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read".to_string()).into_response(),
    };
    
    let ext = std::path::Path::new(&filename).extension().and_then(|e| e.to_str()).unwrap_or("jpg");
    let mime_type = match ext {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/jpeg",
    };
    
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, mime_type)],
        bytes,
    ).into_response()
}

async fn start_batch(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<BatchStartRequest>,
) -> Json<GenericResponse> {
    println!("API CALLED: /api/start-batch with total={}", payload.total);
    *state.is_cancelled.lock().unwrap() = false;
    let _ = state.app_handle.emit("batch-started", serde_json::json!({
        "total": payload.total
    }));
    Json(GenericResponse { success: true, error: None })
}

async fn cancel_batch(
    State(state): State<Arc<AppState>>,
) -> Json<GenericResponse> {
    *state.is_cancelled.lock().unwrap() = true;
    let _ = state.app_handle.emit("batch-cancelled", serde_json::json!({}));
    Json(GenericResponse { success: true, error: None })
}

async fn receive_log(
    Json(payload): Json<LogRequest>,
) -> Json<GenericResponse> {
    println!("API CALLED: /api/log: [{}] {}", payload.level, payload.message);
    Json(GenericResponse { success: true, error: None })
}

async fn trash_image(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<TrashImageRequest>,
) -> Json<GenericResponse> {
    let ws_dir = match get_or_create_active_workspace(&state.app_handle) {
        Ok(dir) => dir,
        Err(e) => return Json(GenericResponse { success: false, error: Some(e) }),
    };
    let trash_dir = ws_dir.join("trash");
    tokio::fs::create_dir_all(&trash_dir).await.ok();
    
    let path = std::path::Path::new(&payload.filepath);
    let filename = path.file_name().unwrap_or_default();
    
    let src = ws_dir.join(filename);
    let dest = trash_dir.join(filename);
    
    if src.exists() {
        if let Err(e) = tokio::fs::rename(src, dest).await {
            return Json(GenericResponse { success: false, error: Some(e.to_string()) });
        }
    }
    Json(GenericResponse { success: true, error: None })
}

async fn restore_trash(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<TrashImageRequest>,
) -> Json<GenericResponse> {
    let ws_dir = match get_or_create_active_workspace(&state.app_handle) {
        Ok(dir) => dir,
        Err(e) => return Json(GenericResponse { success: false, error: Some(e) }),
    };
    let trash_dir = ws_dir.join("trash");
    
    let path = std::path::Path::new(&payload.filepath);
    let filename = path.file_name().unwrap_or_default();
    
    let src = trash_dir.join(filename);
    let dest = ws_dir.join(filename);
    
    if src.exists() {
        if let Err(e) = tokio::fs::rename(src, dest).await {
            return Json(GenericResponse { success: false, error: Some(e.to_string()) });
        }
    }
    Json(GenericResponse { success: true, error: None })
}

#[derive(Serialize)]
struct ListImagesResponse {
    success: bool,
    images: Vec<String>,
    error: Option<String>,
}

async fn list_trash(
    State(state): State<Arc<AppState>>,
) -> Json<ListImagesResponse> {
    let ws_dir = match get_or_create_active_workspace(&state.app_handle) {
        Ok(dir) => dir,
        Err(e) => return Json(ListImagesResponse { success: false, images: vec![], error: Some(e) }),
    };
    let trash_dir = ws_dir.join("trash");
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(trash_dir) {
        for entry in entries.filter_map(Result::ok) {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    if let Some(name) = entry.file_name().to_str() {
                        if !name.starts_with('.') {
                            files.push(name.to_string());
                        }
                    }
                }
            }
        }
    }
    Json(ListImagesResponse {
        success: true,
        images: files,
        error: None,
    })
}

async fn list_images(
    State(state): State<Arc<AppState>>,
) -> Json<ListImagesResponse> {
    let ws_dir = match get_or_create_active_workspace(&state.app_handle) {
        Ok(dir) => dir,
        Err(e) => return Json(ListImagesResponse { success: false, images: vec![], error: Some(e) }),
    };
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(ws_dir) {
        for entry in entries.filter_map(Result::ok) {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    if let Some(name) = entry.file_name().to_str() {
                        if !name.starts_with('.') && name != "project.json" {
                            files.push(name.to_string());
                        }
                    }
                }
            }
        }
    }
    Json(ListImagesResponse {
        success: true,
        images: files,
        error: None,
    })
}

async fn get_project_state(
    State(state): State<Arc<AppState>>,
) -> Json<ProjectStateResponse> {
    let ws_dir = match get_or_create_active_workspace(&state.app_handle) {
        Ok(dir) => dir,
        Err(e) => return Json(ProjectStateResponse { success: false, state: None, error: Some(e) }),
    };
    let project_file = ws_dir.join("project.json");
    
    let p_state = if project_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&project_file) {
            serde_json::from_str(&content).unwrap_or_else(|_| ProjectState::default())
        } else {
            ProjectState::default()
        }
    } else {
        ProjectState::default()
    };

    Json(ProjectStateResponse {
        success: true,
        state: Some(p_state),
        error: None,
    })
}

async fn update_project_state(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UpdateProjectStateRequest>,
) -> Json<GenericResponse> {
    let ws_dir = match get_or_create_active_workspace(&state.app_handle) {
        Ok(dir) => dir,
        Err(e) => return Json(GenericResponse { success: false, error: Some(e) }),
    };
    let project_file = ws_dir.join("project.json");
    
    if let Ok(content) = serde_json::to_string_pretty(&payload.state) {
        if let Err(e) = std::fs::write(&project_file, content) {
            return Json(GenericResponse {
                success: false,
                error: Some(format!("Failed to write project state: {}", e)),
            });
        }
    } else {
        return Json(GenericResponse {
            success: false,
            error: Some("Failed to serialize project state".to_string()),
        });
    }

    Json(GenericResponse {
        success: true,
        error: None,
    })
}

async fn save_image(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SaveImageRequest>,
) -> Json<SaveImageResponse> {
    println!("API CALLED: /api/save-image (page: {:?}, url: {:?})", payload.page, payload.url);
    if *state.is_cancelled.lock().unwrap() {
        return Json(SaveImageResponse {
            success: false,
            status: None,
            filepath: None,
            error: Some("Batch was cancelled".to_string()),
        });
    }

    let save_dir = match get_or_create_active_workspace(&state.app_handle) {
        Ok(dir) => dir,
        Err(e) => return Json(SaveImageResponse { success: false, status: Some("failed".to_string()), filepath: None, error: Some(e) }),
    };
    
    if let Err(e) = tokio::fs::create_dir_all(&save_dir).await {
        return Json(SaveImageResponse {
            success: false,
            status: Some("failed".to_string()),
            filepath: None,
            error: Some(format!("Failed to create directory: {}", e)),
        });
    }

    // 2. Get the image bytes (prefer base64_data if provided)
    if let Some(b64) = &payload.base64_data {
        let parts: Vec<&str> = b64.splitn(2, ",").collect();
        let base64_str = if parts.len() == 2 { parts[1] } else { parts[0] };
        use base64::{Engine as _, engine::general_purpose};
        match general_purpose::STANDARD.decode(base64_str) {
            Ok(b) => {
                let bytes = axum::body::Bytes::from(b);
                let mut hasher = Sha256::new();
                hasher.update(&bytes);
                let hash_result = hasher.finalize();
                let hash_hex = hex::encode(hash_result);
                let ext = if payload.base64_data.as_ref().unwrap().contains("image/png") { "png" } else { "jpg" };
                let filename = format!("{}.{}", hash_hex, ext);
                let filepath = save_dir.join(&filename);
                let trashpath = save_dir.join("trash").join(&filename);

                if trashpath.exists() {
                    let _ = state.app_handle.emit("image-saved", serde_json::json!({
                        "filepath": filename,
                        "page": payload.page,
                        "status": "trashed"
                    }));
                    return Json(SaveImageResponse {
                        success: true,
                        status: Some("trashed".to_string()),
                        filepath: Some(filename),
                        error: None,
                    });
                }

                if filepath.exists() {
                    let _ = state.app_handle.emit("image-saved", serde_json::json!({
                        "filepath": filename,
                        "page": payload.page,
                        "status": "duplicate"
                    }));
                    return Json(SaveImageResponse {
                        success: true,
                        status: Some("duplicate".to_string()),
                        filepath: Some(filename),
                        error: None,
                    });
                }

                if let Err(e) = tokio::fs::write(&filepath, bytes).await {
                    return Json(SaveImageResponse {
                        success: false,
                        status: Some("failed".to_string()),
                        filepath: None,
                        error: Some(e.to_string()),
                    });
                }

                let _ = state.app_handle.emit("image-saved", serde_json::json!({
                    "filepath": filename,
                    "page": payload.page,
                }));
                
                Json(SaveImageResponse {
                    success: true,
                    status: Some("new".to_string()),
                    filepath: Some(filename),
                    error: None,
                })
            },
            Err(e) => {
                return Json(SaveImageResponse {
                    success: false,
                    status: Some("failed".to_string()),
                    filepath: None,
                    error: Some(e.to_string()),
                });
            }
        }
    } else if let Some(url) = &payload.url {
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0")
            .build()
            .unwrap_or_default();
        
        match client.get(url).send().await {
            Ok(resp) => match resp.bytes().await {
                Ok(b) => {
                    let mut hasher = Sha256::new();
                    hasher.update(&b);
                    let hash_result = hasher.finalize();
                    let hash_hex = hex::encode(hash_result);
                    
                    let path = std::path::Path::new(url);
                    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("jpg");
                    let filename = format!("{}.{}", hash_hex, ext);
                    
                    let filepath = save_dir.join(&filename);
                    let trashpath = save_dir.join("trash").join(&filename);

                    if trashpath.exists() {
                        let _ = state.app_handle.emit("image-saved", serde_json::json!({
                            "filepath": filename,
                            "page": payload.page,
                            "status": "trashed"
                        }));
                        return Json(SaveImageResponse {
                            success: true,
                            status: Some("trashed".to_string()),
                            filepath: Some(filename),
                            error: None,
                        });
                    }

                    if filepath.exists() {
                        let _ = state.app_handle.emit("image-saved", serde_json::json!({
                            "filepath": filename,
                            "page": payload.page,
                            "status": "duplicate"
                        }));
                        return Json(SaveImageResponse {
                            success: true,
                            status: Some("duplicate".to_string()),
                            filepath: Some(filename),
                            error: None,
                        });
                    }

                    if let Err(e) = tokio::fs::write(&filepath, b).await {
                        return Json(SaveImageResponse {
                            success: false,
                            status: Some("failed".to_string()),
                            filepath: None,
                            error: Some(format!("Failed to write file: {}", e)),
                        });
                    }

                    let _ = state.app_handle.emit("image-saved", serde_json::json!({
                        "filepath": filename,
                        "page": payload.page,
                        "status": "new"
                    }));

                    Json(SaveImageResponse {
                        success: true,
                        status: Some("new".to_string()),
                        filepath: Some(filename),
                        error: None,
                    })
                },
                Err(e) => return Json(SaveImageResponse { success: false, status: Some("failed".to_string()), filepath: None, error: Some(e.to_string()) })
            },
            Err(e) => return Json(SaveImageResponse { success: false, status: Some("failed".to_string()), filepath: None, error: Some(e.to_string()) })
        }
    } else {
        return Json(SaveImageResponse {
            success: false,
            status: Some("failed".to_string()),
            filepath: None,
            error: Some("Either url or base64_data must be provided".to_string()),
        });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            app.manage(ProjectManager {
                active_workspace: Mutex::new(None),
            });
            
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                start_server(handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            project_manager::create_project,
            project_manager::open_project,
            project_manager::save_project,
            project_manager::close_project,
            project_manager::update_project_state,
            project_manager::get_system_fonts,
            greet
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
