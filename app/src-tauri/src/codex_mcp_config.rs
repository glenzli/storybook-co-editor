use crate::mcp_server;
use serde::Serialize;
use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    str::FromStr,
};
use tauri::{AppHandle, Manager};
use toml_edit::{value, DocumentMut, InlineTable, Item, Table, Value};
use uuid::Uuid;

const CODEX_CONFIG_DIRECTORY: &str = ".codex";
const CODEX_CONFIG_FILENAME: &str = "config.toml";
const STORYBOOK_SERVER_ID: &str = "storybook";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexMcpInstallResult {
    pub replaced_existing: bool,
}

#[tauri::command]
pub fn install_mcp_into_codex(app: AppHandle) -> Result<CodexMcpInstallResult, String> {
    let connection = mcp_server::get_mcp_connection_info(app.clone())?;
    let config_path = codex_config_path(&app)?;
    let existing = match std::fs::read_to_string(&config_path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(_) => return Err("CODEX_CONFIG_INSTALL_FAILED".to_string()),
    };
    let (contents, replaced_existing) =
        configure_storybook_server(&existing, &connection.endpoint, &connection.access_token)?;

    write_config_atomically(&config_path, &contents)
        .map_err(|_| "CODEX_CONFIG_INSTALL_FAILED".to_string())?;

    Ok(CodexMcpInstallResult { replaced_existing })
}

fn codex_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let home_directory = app
        .path()
        .home_dir()
        .map_err(|_| "CODEX_CONFIG_INSTALL_FAILED".to_string())?;
    Ok(home_directory
        .join(CODEX_CONFIG_DIRECTORY)
        .join(CODEX_CONFIG_FILENAME))
}

fn configure_storybook_server(
    existing: &str,
    endpoint: &str,
    access_token: &str,
) -> Result<(String, bool), String> {
    let mut document = if existing.trim().is_empty() {
        DocumentMut::new()
    } else {
        DocumentMut::from_str(existing).map_err(|_| "CODEX_CONFIG_INVALID".to_string())?
    };
    let root = document.as_table_mut();
    let mut servers = match root.remove("mcp_servers") {
        None => Table::new(),
        Some(Item::Table(table)) => table,
        Some(Item::Value(Value::InlineTable(table))) => table.into_table(),
        Some(_) => return Err("CODEX_CONFIG_INVALID".to_string()),
    };
    let replaced_existing = servers.contains_key(STORYBOOK_SERVER_ID);
    servers.insert(
        STORYBOOK_SERVER_ID,
        Item::Table(storybook_server_table(endpoint, access_token)),
    );
    root.insert("mcp_servers", Item::Table(servers));

    Ok((document.to_string(), replaced_existing))
}

fn storybook_server_table(endpoint: &str, access_token: &str) -> Table {
    let mut headers = InlineTable::new();
    headers.insert(
        "Authorization",
        Value::from(format!("Bearer {access_token}")),
    );
    headers.fmt();

    let mut server = Table::new();
    server.insert("url", value(endpoint));
    server.insert("http_headers", Item::Value(Value::InlineTable(headers)));
    server
}

fn write_config_atomically(path: &Path, contents: &str) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "CODEX_CONFIG_INSTALL_FAILED".to_string())?;
    std::fs::create_dir_all(directory).map_err(|error| error.to_string())?;

    let temporary_path = directory.join(format!(
        ".{CODEX_CONFIG_FILENAME}.{}.tmp",
        Uuid::new_v4().simple()
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
        file.write_all(contents.as_bytes())
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        std::fs::rename(&temporary_path, path).map_err(|error| error.to_string())?;
        secure_config_file(path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary_path);
    }
    result
}

#[cfg(unix)]
fn secure_config_file(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn secure_config_file(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{configure_storybook_server, STORYBOOK_SERVER_ID};
    use std::str::FromStr;
    use toml_edit::DocumentMut;

    #[test]
    fn adds_storybook_server_without_changing_other_servers() {
        let input =
            "model = \"gpt-5\"\n\n[mcp_servers.existing]\nurl = \"https://example.test/mcp\"\n";
        let (configured, replaced_existing) =
            configure_storybook_server(input, "http://127.0.0.1:14320/mcp", "token-value").unwrap();
        let document = DocumentMut::from_str(&configured).unwrap();

        assert!(!replaced_existing);
        assert_eq!(document["model"].as_str(), Some("gpt-5"));
        assert_eq!(
            document["mcp_servers"]["existing"]["url"].as_str(),
            Some("https://example.test/mcp")
        );
        assert_eq!(
            document["mcp_servers"][STORYBOOK_SERVER_ID]["url"].as_str(),
            Some("http://127.0.0.1:14320/mcp")
        );
        assert_eq!(
            document["mcp_servers"][STORYBOOK_SERVER_ID]["http_headers"]["Authorization"].as_str(),
            Some("Bearer token-value")
        );
    }

    #[test]
    fn replaces_only_the_storybook_server_entry() {
        let input = "[mcp_servers.storybook]\nurl = \"https://old.example/mcp\"\nenabled = false\n";
        let (configured, replaced_existing) =
            configure_storybook_server(input, "http://127.0.0.1:14320/mcp", "token-value").unwrap();
        let document = DocumentMut::from_str(&configured).unwrap();

        assert!(replaced_existing);
        assert_eq!(
            document["mcp_servers"][STORYBOOK_SERVER_ID]["url"].as_str(),
            Some("http://127.0.0.1:14320/mcp")
        );
        assert!(!document["mcp_servers"][STORYBOOK_SERVER_ID]
            .as_table()
            .unwrap()
            .contains_key("enabled"));
    }

    #[test]
    fn rejects_invalid_existing_configuration() {
        assert_eq!(
            configure_storybook_server("[mcp_servers", "http://127.0.0.1", "token").unwrap_err(),
            "CODEX_CONFIG_INVALID"
        );
    }
}
