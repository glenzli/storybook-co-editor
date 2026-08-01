use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::process::{Child, ChildStdout, Command};

pub(crate) struct CodexSession {
    child: Child,
    stdin: tokio::process::ChildStdin,
    lines: Lines<BufReader<ChildStdout>>,
}

impl CodexSession {
    pub(crate) async fn send(&mut self, message: Value) -> Result<(), String> {
        let mut encoded =
            serde_json::to_vec(&message).map_err(|_| "CODEX_PROTOCOL_ERROR".to_string())?;
        encoded.push(b'\n');
        self.stdin
            .write_all(&encoded)
            .await
            .map_err(|_| "CODEX_PROTOCOL_ERROR".to_string())?;
        self.stdin
            .flush()
            .await
            .map_err(|_| "CODEX_PROTOCOL_ERROR".to_string())
    }

    pub(crate) async fn next_message(&mut self) -> Result<Value, String> {
        loop {
            let line = self
                .lines
                .next_line()
                .await
                .map_err(|_| "CODEX_PROTOCOL_ERROR".to_string())?
                .ok_or_else(|| "CODEX_PROTOCOL_ERROR".to_string())?;
            if line.trim().is_empty() {
                continue;
            }
            return serde_json::from_str(&line).map_err(|_| "CODEX_PROTOCOL_ERROR".to_string());
        }
    }

    pub(crate) async fn response(&mut self, id: i64) -> Result<Value, String> {
        loop {
            let message = self.next_message().await?;
            if message.get("id").and_then(Value::as_i64) != Some(id) {
                continue;
            }
            if message.get("error").is_some() {
                return Err("CODEX_REQUEST_FAILED".to_string());
            }
            return message
                .get("result")
                .cloned()
                .ok_or_else(|| "CODEX_PROTOCOL_ERROR".to_string());
        }
    }

    pub(crate) async fn initialize(&mut self) -> Result<(), String> {
        self.send(json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "clientInfo": {
                    "name": "storybook_co_editor",
                    "title": "Storybook Co-Editor",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }
        }))
        .await?;
        self.response(1).await?;
        self.send(json!({
            "jsonrpc": "2.0",
            "method": "initialized"
        }))
        .await
    }

    pub(crate) async fn shutdown(&mut self) {
        let _ = self.child.kill().await;
    }
}

fn codex_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(path) = std::env::var("STORYBOOK_CODEX_BIN") {
        candidates.push(PathBuf::from(path));
    }
    candidates.push(PathBuf::from("codex"));
    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from(
            "/Applications/ChatGPT.app/Contents/Resources/codex",
        ));
        candidates.push(PathBuf::from(
            "/Applications/Codex.app/Contents/Resources/codex",
        ));
    }
    candidates
}

pub(crate) async fn spawn_codex(work_dir: &Path) -> Result<CodexSession, String> {
    for binary in codex_candidates() {
        let spawned = Command::new(&binary)
            .arg("app-server")
            .current_dir(work_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn();

        let Ok(mut child) = spawned else {
            continue;
        };
        let Some(stdin) = child.stdin.take() else {
            let _ = child.kill().await;
            continue;
        };
        let Some(stdout) = child.stdout.take() else {
            let _ = child.kill().await;
            continue;
        };
        return Ok(CodexSession {
            child,
            stdin,
            lines: BufReader::new(stdout).lines(),
        });
    }
    Err("CODEX_NOT_FOUND".to_string())
}
