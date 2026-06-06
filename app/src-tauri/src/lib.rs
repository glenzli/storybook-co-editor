use axum::{
    routing::post,
    Router,
    Json,
    extract::{State, DefaultBodyLimit},
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Emitter};
use tower_http::{cors::{Any, CorsLayer}, services::ServeDir};
use sha2::{Sha256, Digest};

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

#[derive(Serialize, Deserialize, Clone)]
struct ProjectState {
    #[serde(default)]
    project_id: String,
    #[serde(default)]
    visible_images: Vec<String>,
    #[serde(default)]
    trashed_images: Vec<String>,
    #[serde(default)]
    global_script: String,
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

fn get_save_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let mut save_dir = std::path::PathBuf::from(home);
    save_dir.push("Downloads");
    save_dir.push("StorybookProjects");
    save_dir.push("default");
    save_dir
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
    
    let save_dir = get_save_dir();
    tokio::fs::create_dir_all(&save_dir).await.ok(); // Ensure directory exists for ServeDir

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
        .nest_service("/images", ServeDir::new(save_dir))
        .layer(cors)
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:14320").await.unwrap();
    println!("Local server listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
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
    use std::io::Write;
    use std::fs::OpenOptions;
    
    let log_path = "/Users/g4i/lab/storybook-co-editor/extension_debug.log";
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let _ = writeln!(file, "[{}] [{}] [{}]: {}", timestamp, payload.level.to_uppercase(), payload.source, payload.message);
    }
    Json(GenericResponse { success: true, error: None })
}

async fn trash_image(
    State(_state): State<Arc<AppState>>,
    Json(payload): Json<TrashImageRequest>,
) -> Json<GenericResponse> {
    let save_dir = get_save_dir();
    let trash_dir = save_dir.join("trash");
    tokio::fs::create_dir_all(&trash_dir).await.ok();
    
    // Extract filename from filepath just to be safe
    let path = std::path::Path::new(&payload.filepath);
    let filename = path.file_name().unwrap_or_default();
    
    let src = save_dir.join(filename);
    let dest = trash_dir.join(filename);
    
    if src.exists() {
        if let Err(e) = tokio::fs::rename(src, dest).await {
            return Json(GenericResponse { success: false, error: Some(e.to_string()) });
        }
    }
    Json(GenericResponse { success: true, error: None })
}

async fn restore_trash(
    State(_state): State<Arc<AppState>>,
    Json(payload): Json<TrashImageRequest>,
) -> Json<GenericResponse> {
    let save_dir = get_save_dir();
    let trash_dir = save_dir.join("trash");
    
    let path = std::path::Path::new(&payload.filepath);
    let filename = path.file_name().unwrap_or_default();
    
    let src = trash_dir.join(filename);
    let dest = save_dir.join(filename);
    
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
    State(_state): State<Arc<AppState>>,
) -> Json<ListImagesResponse> {
    let save_dir = get_save_dir();
    let trash_dir = save_dir.join("trash");
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
    State(_state): State<Arc<AppState>>,
) -> Json<ListImagesResponse> {
    let save_dir = get_save_dir();
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(save_dir) {
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

async fn get_project_state(
    State(_state): State<Arc<AppState>>,
) -> Json<ProjectStateResponse> {
    let save_dir = get_save_dir();
    let project_file = save_dir.join("project.json");
    
    let state = if project_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&project_file) {
            serde_json::from_str(&content).unwrap_or_else(|_| ProjectState {
                project_id: "default".to_string(),
                visible_images: vec![],
                trashed_images: vec![],
                global_script: "".to_string(),
            })
        } else {
            ProjectState {
                project_id: "default".to_string(),
                visible_images: vec![],
                trashed_images: vec![],
                global_script: "".to_string(),
            }
        }
    } else {
        ProjectState {
            project_id: "default".to_string(),
            visible_images: vec![],
            trashed_images: vec![],
            global_script: "".to_string(),
        }
    };

    Json(ProjectStateResponse {
        success: true,
        state: Some(state),
        error: None,
    })
}

async fn update_project_state(
    State(_state): State<Arc<AppState>>,
    Json(payload): Json<UpdateProjectStateRequest>,
) -> Json<GenericResponse> {
    let save_dir = get_save_dir();
    let project_file = save_dir.join("project.json");
    
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

    let save_dir = get_save_dir();
    
    if let Err(e) = tokio::fs::create_dir_all(&save_dir).await {
        let _ = state.app_handle.emit("image-saved", serde_json::json!({
            "filepath": "",
            "page": payload.page,
            "status": "failed"
        }));
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
                    let _ = state.app_handle.emit("image-saved", serde_json::json!({
                        "filepath": "",
                        "page": payload.page,
                        "status": "failed"
                    }));
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
                let _ = state.app_handle.emit("image-saved", serde_json::json!({
                    "filepath": "",
                    "page": payload.page,
                    "status": "failed"
                }));
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
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
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
                        let _ = state.app_handle.emit("image-saved", serde_json::json!({
                            "filepath": "",
                            "page": payload.page,
                            "status": "failed"
                        }));
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
                Err(e) => {
                    let _ = state.app_handle.emit("image-saved", serde_json::json!({
                        "filepath": "",
                        "page": payload.page,
                        "status": "failed"
                    }));
                    return Json(SaveImageResponse {
                        success: false,
                        status: Some("failed".to_string()),
                        filepath: None,
                        error: Some(format!("Failed to read bytes: {}", e)),
                    });
                }
            },
            Err(e) => {
                let _ = state.app_handle.emit("image-saved", serde_json::json!({
                    "filepath": "",
                    "page": payload.page,
                    "status": "failed"
                }));
                return Json(SaveImageResponse {
                    success: false,
                    status: Some("failed".to_string()),
                    filepath: None,
                    error: Some(format!("Failed to download: {}", e)),
                });
            }
        }
    } else {
        let _ = state.app_handle.emit("image-saved", serde_json::json!({
            "filepath": "",
            "page": payload.page,
            "status": "failed"
        }));
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
        .setup(|app| {
            let handle = app.handle().clone();
            // Start the background server
            tauri::async_runtime::spawn(async move {
                start_server(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
