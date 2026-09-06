use crate::project_manager::ProjectManager;
use crate::project_operations;
use axum::{
    body::Body,
    extract::State,
    http::{header::AUTHORIZATION, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    Router,
};
use rand::RngCore;
use rmcp::{
    handler::server::{
        tool::ToolRouter,
        wrapper::{Json, Parameters},
    },
    model::{
        CallToolResult, ContentBlock, Implementation, ListResourcesResult, PaginatedRequestParams,
        ReadResourceRequestParams, ReadResourceResult, Resource, ResourceContents,
        ServerCapabilities, ServerInfo,
    },
    schemars, tool, tool_handler, tool_router, ErrorData as McpError, RoleServer, ServerHandler,
};
use rmcp::{
    service::RequestContext,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
    },
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::OpenOptions,
    future::{ready, Future},
    io::Write,
    sync::{Arc, Mutex, RwLock},
};
use tauri::{AppHandle, Manager};

const MCP_ENDPOINT: &str = "http://127.0.0.1:14320/mcp";
const ACTIVE_PROJECT_URI: &str = "storybook://project/active";
const STORY_SCRIPT_URI: &str = "storybook://project/story";
const TOKEN_FILENAME: &str = "mcp-access-token";

#[derive(Serialize)]
pub struct McpConnectionInfo {
    pub(crate) endpoint: String,
    pub(crate) access_token: String,
    codex_config: String,
}

#[derive(Clone, Default)]
pub struct McpTokenState {
    expected_hash: Arc<RwLock<Option<[u8; 32]>>>,
    rotation_lock: Arc<Mutex<()>>,
}

impl McpTokenState {
    fn load_current_token(&self, app: &AppHandle) -> Result<String, String> {
        let _rotation_guard = self
            .rotation_lock
            .lock()
            .map_err(|_| "MCP_TOKEN_ROTATION_FAILED".to_string())?;
        let token = load_or_create_token(app)?;
        self.update_expected_hash(&token)?;
        Ok(token)
    }

    fn rotate_token(&self, app: &AppHandle) -> Result<String, String> {
        let _rotation_guard = self
            .rotation_lock
            .lock()
            .map_err(|_| "MCP_TOKEN_ROTATION_FAILED".to_string())?;
        let token = generate_access_token();
        write_token_atomically(&token_path(app)?, &token)
            .map_err(|_| "MCP_TOKEN_ROTATION_FAILED".to_string())?;
        self.update_expected_hash(&token)?;
        Ok(token)
    }

    fn update_expected_hash(&self, token: &str) -> Result<(), String> {
        let mut expected_hash = self
            .expected_hash
            .write()
            .map_err(|_| "MCP_TOKEN_ROTATION_FAILED".to_string())?;
        *expected_hash = Some(Sha256::digest(token.as_bytes()).into());
        Ok(())
    }

    fn matches(&self, token: &str) -> bool {
        let supplied_hash: [u8; 32] = Sha256::digest(token.as_bytes()).into();
        self.expected_hash
            .read()
            .ok()
            .and_then(|expected_hash| *expected_hash)
            .is_some_and(|expected_hash| expected_hash == supplied_hash)
    }
}

#[derive(Clone)]
struct StorybookMcp {
    app: AppHandle,
    tool_router: ToolRouter<Self>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct EmptyInput {}

#[derive(Deserialize, schemars::JsonSchema)]
struct LanguageInput {
    /// BCP 47 content language. Omit to use the project's default language.
    language: Option<String>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct ReplaceStoryScriptInput {
    /// The last_modified value returned by a preceding read.
    expected_last_modified: String,
    /// BCP 47 content language. Omit to use the project's default language.
    language: Option<String>,
    /// The complete replacement script, including all page tags.
    script: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct PageIndexInput {
    /// BCP 47 content language. Omit to use the project's default language.
    language: Option<String>,
    /// Zero-based editor page index. The cover is page 0.
    page_index: usize,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct SetPageTextPositionInput {
    /// The last_modified value returned by a preceding read.
    expected_last_modified: String,
    /// BCP 47 content language. Omit to use the project's default language.
    language: Option<String>,
    /// Zero-based editor page index. The cover is page 0.
    page_index: usize,
    /// Horizontal text offset in canvas pixels.
    offset_x: f64,
    /// Vertical text offset in canvas pixels.
    offset_y: f64,
}

#[derive(Serialize, schemars::JsonSchema)]
struct ProjectOverviewOutput {
    project_name: String,
    last_modified: String,
    page_count: usize,
    canvas_width: u32,
    canvas_height: u32,
    default_language: String,
    languages: Vec<String>,
}

#[derive(Serialize, schemars::JsonSchema)]
struct StoryScriptOutput {
    language: String,
    script: String,
    last_modified: String,
}

#[derive(Serialize, schemars::JsonSchema)]
struct PageLayoutOutput {
    language: String,
    page_index: usize,
    image_filename: String,
    offset_x: f64,
    offset_y: f64,
    text_color: Option<String>,
    last_modified: String,
}

#[derive(Serialize, schemars::JsonSchema)]
struct MutationOutput {
    success: bool,
    last_modified: String,
}

fn tool_error(error: String) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(error)])
}

#[tool_router]
impl StorybookMcp {
    fn new(app: AppHandle) -> Self {
        Self {
            app,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        name = "get_project_overview",
        description = "Read the active Storybook project name, revision, page count, and canvas size.",
        annotations(
            title = "Get project overview",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn get_project_overview(
        &self,
        Parameters(_input): Parameters<EmptyInput>,
    ) -> Result<Json<ProjectOverviewOutput>, CallToolResult> {
        let snapshot =
            project_operations::active_project_from_app(&self.app).map_err(tool_error)?;
        let default_language = snapshot.state.default_language_tag();
        let mut languages: Vec<_> = snapshot.state.languages.keys().cloned().collect();
        languages.sort();
        if languages.is_empty() {
            languages.push(default_language.clone());
        }
        Ok(Json(ProjectOverviewOutput {
            project_name: snapshot.state.project_name,
            last_modified: snapshot.state.last_modified,
            page_count: snapshot.state.visible_images.len(),
            canvas_width: snapshot.state.canvas_width,
            canvas_height: snapshot.state.canvas_height,
            default_language,
            languages,
        }))
    }

    #[tool(
        name = "get_story_script",
        description = "Read one complete content-language story script and its revision token.",
        annotations(
            title = "Get story script",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn get_story_script(
        &self,
        Parameters(input): Parameters<LanguageInput>,
    ) -> Result<Json<StoryScriptOutput>, CallToolResult> {
        let snapshot =
            project_operations::active_project_from_app(&self.app).map_err(tool_error)?;
        let language = input
            .language
            .unwrap_or_else(|| snapshot.state.default_language_tag());
        Ok(Json(StoryScriptOutput {
            language: language.clone(),
            script: snapshot
                .state
                .story_script(Some(&language))
                .map_err(tool_error)?
                .to_string(),
            last_modified: snapshot.state.last_modified,
        }))
    }

    #[tool(
        name = "replace_story_script",
        description = "Replace one content-language story script. Read it first and pass its exact last_modified value to prevent overwriting concurrent edits.",
        annotations(
            title = "Replace story script",
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn replace_story_script(
        &self,
        Parameters(input): Parameters<ReplaceStoryScriptInput>,
    ) -> Result<Json<MutationOutput>, CallToolResult> {
        let manager = self.app.state::<ProjectManager>();
        let snapshot = project_operations::replace_story_script(
            &self.app,
            &manager,
            &input.expected_last_modified,
            input.language,
            input.script,
            "mcp",
        )
        .map_err(tool_error)?;
        Ok(Json(MutationOutput {
            success: true,
            last_modified: snapshot.state.last_modified,
        }))
    }

    #[tool(
        name = "get_page_layout",
        description = "Read an editor page's image and page-specific text position.",
        annotations(
            title = "Get page layout",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn get_page_layout(
        &self,
        Parameters(input): Parameters<PageIndexInput>,
    ) -> Result<Json<PageLayoutOutput>, CallToolResult> {
        let snapshot =
            project_operations::active_project_from_app(&self.app).map_err(tool_error)?;
        let image_filename = snapshot
            .state
            .visible_images
            .get(input.page_index)
            .cloned()
            .ok_or_else(|| tool_error(format!("PAGE_OUT_OF_RANGE: {}", input.page_index)))?;
        let language = input
            .language
            .unwrap_or_else(|| snapshot.state.default_language_tag());
        let page_override = snapshot
            .state
            .page_text_override(Some(&language), input.page_index)
            .map_err(tool_error)?;

        Ok(Json(PageLayoutOutput {
            language,
            page_index: input.page_index,
            image_filename,
            offset_x: page_override.offset_x,
            offset_y: page_override.offset_y,
            text_color: page_override.text_color,
            last_modified: snapshot.state.last_modified,
        }))
    }

    #[tool(
        name = "set_page_text_position",
        description = "Set the page-specific text position in canvas pixels. Read the page first and pass its exact last_modified value.",
        annotations(
            title = "Set page text position",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    fn set_page_text_position(
        &self,
        Parameters(input): Parameters<SetPageTextPositionInput>,
    ) -> Result<Json<MutationOutput>, CallToolResult> {
        let manager = self.app.state::<ProjectManager>();
        let snapshot = project_operations::set_page_text_position(
            &self.app,
            &manager,
            &input.expected_last_modified,
            input.language,
            input.page_index,
            input.offset_x,
            input.offset_y,
            "mcp",
        )
        .map_err(tool_error)?;
        Ok(Json(MutationOutput {
            success: true,
            last_modified: snapshot.state.last_modified,
        }))
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for StorybookMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(
            ServerCapabilities::builder()
                .enable_resources()
                .enable_tools()
                .build(),
        )
        .with_server_info(
            Implementation::new("storybook-co-editor", env!("CARGO_PKG_VERSION"))
                .with_title("Storybook Co-Editor")
                .with_description("Local tools for reading and editing the active storybook project."),
        )
        .with_instructions(
            "Read before writing. Every mutating tool requires the exact last_modified revision returned by a preceding read. Ask the user before applying broad story or layout changes.",
        )
    }

    fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> impl Future<Output = Result<ListResourcesResult, McpError>> + Send + '_ {
        ready(Ok(ListResourcesResult::with_all_items(vec![
            Resource::new(ACTIVE_PROJECT_URI, "active_project")
                .with_title("Active Storybook project")
                .with_description("Complete active project state as JSON")
                .with_mime_type("application/json"),
            Resource::new(STORY_SCRIPT_URI, "story_script")
                .with_title("Active story script")
                .with_description("Tagged story script and current revision")
                .with_mime_type("application/json"),
        ])))
    }

    fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> impl Future<Output = Result<ReadResourceResult, McpError>> + Send + '_ {
        let result = (|| {
            let snapshot = project_operations::active_project_from_app(&self.app)
                .map_err(|error| McpError::internal_error(error, None))?;
            let text = match request.uri.as_str() {
                ACTIVE_PROJECT_URI => serde_json::to_string_pretty(&snapshot)
                    .map_err(|error| McpError::internal_error(error.to_string(), None))?,
                STORY_SCRIPT_URI => serde_json::to_string_pretty(&serde_json::json!({
                    "language": snapshot.state.default_language_tag(),
                    "script": snapshot.state.story_script(None)
                        .map_err(|error| McpError::internal_error(error, None))?,
                    "last_modified": snapshot.state.last_modified,
                }))
                .map_err(|error| McpError::internal_error(error.to_string(), None))?,
                _ => {
                    return Err(McpError::invalid_params(
                        format!("Unknown resource URI: {}", request.uri),
                        None,
                    ))
                }
            };
            Ok(ReadResourceResult::new(vec![ResourceContents::text(
                text,
                request.uri,
            )
            .with_mime_type("application/json")]))
        })();
        ready(result)
    }
}

fn token_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(TOKEN_FILENAME))
}

fn is_valid_token(token: &str) -> bool {
    token.len() == 64 && token.chars().all(|character| character.is_ascii_hexdigit())
}

fn generate_access_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn load_or_create_token(app: &AppHandle) -> Result<String, String> {
    let path = token_path(app)?;
    if let Ok(token) = std::fs::read_to_string(&path) {
        let token = token.trim();
        if is_valid_token(token) {
            secure_token_file(&path)?;
            return Ok(token.to_string());
        }
    }

    let token = generate_access_token();
    write_token_atomically(&path, &token)?;
    Ok(token)
}

fn write_token_atomically(path: &std::path::Path, token: &str) -> Result<(), String> {
    if !is_valid_token(token) {
        return Err("MCP_TOKEN_ROTATION_FAILED".to_string());
    }
    let directory = path
        .parent()
        .ok_or_else(|| "MCP_TOKEN_ROTATION_FAILED".to_string())?;
    let temporary_path = directory.join(format!(
        ".{TOKEN_FILENAME}.{}.{}",
        std::process::id(),
        &generate_access_token()[..16]
    ));

    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut file = options
            .open(&temporary_path)
            .map_err(|error| error.to_string())?;
        file.write_all(token.as_bytes())
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        std::fs::rename(&temporary_path, path).map_err(|error| error.to_string())?;
        secure_token_file(path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary_path);
    }
    result
}

#[cfg(unix)]
fn secure_token_file(path: &std::path::Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn secure_token_file(_path: &std::path::Path) -> Result<(), String> {
    Ok(())
}

async fn require_token(
    State(token_state): State<McpTokenState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let supplied = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    let authorized = supplied.is_some_and(|token| token_state.matches(token));

    if !authorized {
        return (StatusCode::UNAUTHORIZED, "Missing or invalid bearer token").into_response();
    }
    next.run(request).await
}

pub fn router(app: AppHandle) -> Result<Router, String> {
    let token_state = app.state::<McpTokenState>().inner().clone();
    token_state.load_current_token(&app)?;
    let service_app = app.clone();
    let mut config = StreamableHttpServerConfig::default();
    config.json_response = true;
    config.allowed_hosts = vec![
        "localhost".to_string(),
        "localhost:14320".to_string(),
        "127.0.0.1".to_string(),
        "127.0.0.1:14320".to_string(),
        "::1".to_string(),
    ];
    config.allowed_origins = vec![
        "http://localhost:5173".to_string(),
        "http://127.0.0.1:5173".to_string(),
        "tauri://localhost".to_string(),
        "https://tauri.localhost".to_string(),
    ];
    let service = StreamableHttpService::new(
        move || Ok(StorybookMcp::new(service_app.clone())),
        Arc::new(LocalSessionManager::default()),
        config,
    );

    Ok(Router::new()
        .nest_service("/mcp", service)
        .layer(middleware::from_fn_with_state(token_state, require_token)))
}

fn connection_info(access_token: String) -> McpConnectionInfo {
    let codex_config = format!(
        "[mcp_servers.storybook]\nurl = \"{MCP_ENDPOINT}\"\nhttp_headers = {{ Authorization = \"Bearer {access_token}\" }}"
    );
    McpConnectionInfo {
        endpoint: MCP_ENDPOINT.to_string(),
        access_token,
        codex_config,
    }
}

#[tauri::command]
pub fn get_mcp_connection_info(app: AppHandle) -> Result<McpConnectionInfo, String> {
    let access_token = app.state::<McpTokenState>().load_current_token(&app)?;
    Ok(connection_info(access_token))
}

#[tauri::command]
pub fn rotate_mcp_access_token(app: AppHandle) -> Result<McpConnectionInfo, String> {
    let access_token = app.state::<McpTokenState>().rotate_token(&app)?;
    Ok(connection_info(access_token))
}

#[cfg(test)]
mod tests {
    use super::{
        generate_access_token, is_valid_token, write_token_atomically, McpTokenState, MCP_ENDPOINT,
        TOKEN_FILENAME,
    };

    #[test]
    fn connection_constants_are_local_and_stable() {
        assert_eq!(MCP_ENDPOINT, "http://127.0.0.1:14320/mcp");
        assert_eq!(TOKEN_FILENAME, "mcp-access-token");
    }

    #[test]
    fn generated_token_has_256_bits_of_hex_encoded_entropy() {
        let token = generate_access_token();
        assert!(is_valid_token(&token));
        assert_eq!(token.len(), 64);
    }

    #[test]
    fn rotated_state_rejects_the_previous_token() {
        let state = McpTokenState::default();
        let first = generate_access_token();
        let second = generate_access_token();
        state.update_expected_hash(&first).unwrap();
        assert!(state.matches(&first));
        state.update_expected_hash(&second).unwrap();
        assert!(!state.matches(&first));
        assert!(state.matches(&second));
    }

    #[test]
    fn atomic_write_replaces_the_existing_token() {
        let directory = std::env::temp_dir().join(format!(
            "storybook-co-editor-mcp-token-test-{}",
            &generate_access_token()[..16]
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join(TOKEN_FILENAME);
        let first = generate_access_token();
        let second = generate_access_token();
        write_token_atomically(&path, &first).unwrap();
        write_token_atomically(&path, &second).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), second);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir(&directory);
    }
}
