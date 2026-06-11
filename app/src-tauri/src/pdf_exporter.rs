use serde::Serialize;
use std::process::Command;
use std::fs;

#[derive(Serialize)]
pub struct ConvertResponse {
    pub success: bool,
    pub error_msg: Option<String>,
}

fn find_gs_executable() -> Option<String> {
    let paths = vec![
        "/opt/homebrew/bin/gs", // Apple Silicon Homebrew
        "/usr/local/bin/gs",    // Intel Homebrew
        "gs",                   // In PATH
    ];

    for path in paths {
        if let Ok(output) = Command::new(path).arg("--version").output() {
            if output.status.success() {
                return Some(path.to_string());
            }
        }
    }
    None
}

#[tauri::command]
pub async fn convert_to_cmyk(pdf_data: Vec<u8>, output_path: String) -> ConvertResponse {
    let gs_path = match find_gs_executable() {
        Some(p) => p,
        None => {
            return ConvertResponse {
                success: false,
                error_msg: Some("Ghostscript (gs) 未安装或未在环境变量中。请在终端运行 'brew install ghostscript'。".into()),
            };
        }
    };

    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("temp_rgb_{}.pdf", timestamp));

    if let Err(e) = fs::write(&temp_path, &pdf_data) {
        return ConvertResponse {
            success: false,
            error_msg: Some(format!("写入临时文件失败: {}", e)),
        };
    }

    let input_path_str = temp_path.to_string_lossy().to_string();

    let output = Command::new(gs_path)
        .args(&[
            "-dSAFER",
            "-dBATCH",
            "-dNOPAUSE",
            "-dNOCACHE",
            "-sDEVICE=pdfwrite",
            "-sColorConversionStrategy=CMYK",
            "-dProcessColorModel=/DeviceCMYK",
            &format!("-sOutputFile={}", output_path),
            &input_path_str,
        ])
        .output();

    match output {
        Ok(out) => {
            if out.status.success() {
                // Ignore failure on removing temp file
                let _ = fs::remove_file(&temp_path);
                ConvertResponse {
                    success: true,
                    error_msg: None,
                }
            } else {
                let err = String::from_utf8_lossy(&out.stderr);
                ConvertResponse {
                    success: false,
                    error_msg: Some(format!("色彩转换失败: {}", err)),
                }
            }
        }
        Err(e) => ConvertResponse {
            success: false,
            error_msg: Some(format!("无法执行 Ghostscript: {}", e)),
        },
    }
}
