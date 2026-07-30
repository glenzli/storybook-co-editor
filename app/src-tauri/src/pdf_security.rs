use lopdf::encryption::crypt_filters::{Aes256CryptFilter, CryptFilter};
use lopdf::{Document, EncryptionState, EncryptionVersion, Permissions};
use rand::Rng as _;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrintPermission {
    None,
    LowResolution,
    HighQuality,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfProtectionOptions {
    printing: PrintPermission,
    allow_copying: bool,
    allow_modification: bool,
    allow_annotations: bool,
    #[serde(default)]
    open_password: String,
}

fn build_permissions(options: &PdfProtectionOptions) -> Permissions {
    let mut permissions = Permissions::COPYABLE_FOR_ACCESSIBILITY;

    match options.printing {
        PrintPermission::None => {}
        PrintPermission::LowResolution => permissions |= Permissions::PRINTABLE,
        PrintPermission::HighQuality => {
            permissions |= Permissions::PRINTABLE | Permissions::PRINTABLE_IN_HIGH_QUALITY;
        }
    }
    if options.allow_copying {
        permissions |= Permissions::COPYABLE;
    }
    if options.allow_modification {
        permissions |= Permissions::MODIFIABLE | Permissions::ASSEMBLABLE;
    }
    if options.allow_annotations {
        permissions |= Permissions::ANNOTABLE | Permissions::FILLABLE;
    }

    permissions
}

fn sibling_temp_path(path: &Path, label: &str) -> Result<PathBuf, String> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "PDF 输出路径无效。".to_string())?;
    Ok(path.with_file_name(format!(".{file_name}.storybook-{label}-{}", Uuid::new_v4())))
}

fn replace_with_verified_file(original_path: &Path, protected_path: &Path) -> Result<(), String> {
    std::fs::remove_file(original_path)
        .map_err(|error| format!("无法移除临时明文 PDF：{error}"))?;
    std::fs::rename(protected_path, original_path)
        .map_err(|error| format!("无法安装已验证的加密 PDF：{error}"))
}

fn protect_pdf_at_path(path: &Path, options: &PdfProtectionOptions) -> Result<(), String> {
    let mut document =
        Document::load(path).map_err(|error| format!("无法读取待加密 PDF：{error}"))?;
    if document.is_encrypted() {
        return Err("PDF 已经加密，无法重复应用发布限制。".to_string());
    }

    document.version = "2.0".to_string();
    let permissions = build_permissions(options);
    let mut file_encryption_key = [0_u8; 32];
    let mut owner_password_bytes = [0_u8; 32];
    let mut rng = rand::rng();
    rng.fill(&mut file_encryption_key);
    rng.fill(&mut owner_password_bytes);
    let owner_password = hex::encode(owner_password_bytes);
    let crypt_filter: Arc<dyn CryptFilter> = Arc::new(Aes256CryptFilter);
    let encryption = EncryptionVersion::V5 {
        encrypt_metadata: true,
        crypt_filters: BTreeMap::from([(b"StdCF".to_vec(), crypt_filter)]),
        file_encryption_key: &file_encryption_key,
        stream_filter: b"StdCF".to_vec(),
        string_filter: b"StdCF".to_vec(),
        owner_password: &owner_password,
        user_password: &options.open_password,
        permissions,
    };
    let encryption_state = EncryptionState::try_from(encryption)
        .map_err(|error| format!("无法建立 AES-256 加密状态：{error}"))?;
    let expected_permissions = encryption_state.permissions();
    document
        .encrypt(&encryption_state)
        .map_err(|error| format!("无法加密 PDF：{error}"))?;

    let protected_path = sibling_temp_path(path, "protected")?;
    let result = (|| {
        document
            .save(&protected_path)
            .map_err(|error| format!("无法写入临时加密 PDF：{error}"))?;

        let mut verification = Document::load(&protected_path)
            .map_err(|error| format!("无法重新读取加密 PDF：{error}"))?;
        if !verification.is_encrypted() {
            return Err("加密校验失败：输出文件未标记为加密。".to_string());
        }
        let decoded = EncryptionState::decode(&verification, options.open_password.as_bytes())
            .map_err(|error| format!("加密校验失败：{error}"))?;
        if decoded.version() != 5 || decoded.revision() != 6 {
            return Err(format!(
                "加密校验失败：预期 V=5/R=6，实际 V={}/R={}。",
                decoded.version(),
                decoded.revision()
            ));
        }
        if decoded.permissions() != expected_permissions {
            return Err("加密校验失败：PDF 权限与发布设置不一致。".to_string());
        }
        verification
            .decrypt(&options.open_password)
            .map_err(|error| format!("打开密码校验失败：{error}"))?;

        replace_with_verified_file(path, &protected_path)
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&protected_path);
    }

    result
}

#[tauri::command]
pub fn protect_pdf(path: String, options: PdfProtectionOptions) -> Result<(), String> {
    protect_pdf_at_path(Path::new(&path), &options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::{dictionary, Object};

    fn create_test_pdf(path: &Path) {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let content_id = document.add_object(lopdf::Stream::new(dictionary! {}, Vec::new()));
        let resources_id = document.add_object(dictionary! {});
        let page_id = document.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
            "Resources" => resources_id,
        });
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => vec![page_id.into()],
                "Count" => 1,
                "MediaBox" => vec![0.into(), 0.into(), 300.into(), 300.into()],
            }),
        );
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        document.trailer.set("Root", catalog_id);
        assert_eq!(document.get_pages().len(), 1);
        document.save(path).unwrap();
    }

    #[test]
    fn encrypts_with_aes_256_and_requested_permissions() {
        let path = std::env::temp_dir().join(format!("storybook-pdf-test-{}.pdf", Uuid::new_v4()));
        create_test_pdf(&path);
        let options = PdfProtectionOptions {
            printing: PrintPermission::LowResolution,
            allow_copying: false,
            allow_modification: false,
            allow_annotations: true,
            open_password: "reader-pass".to_string(),
        };

        protect_pdf_at_path(&path, &options).unwrap();

        let mut encrypted = Document::load(&path).unwrap();
        let state = EncryptionState::decode(&encrypted, b"reader-pass").unwrap();
        assert_eq!(state.version(), 5);
        assert_eq!(state.revision(), 6);
        assert!(state.permissions().contains(Permissions::PRINTABLE));
        assert!(!state
            .permissions()
            .contains(Permissions::PRINTABLE_IN_HIGH_QUALITY));
        assert!(!state.permissions().contains(Permissions::COPYABLE));
        assert!(state.permissions().contains(Permissions::ANNOTABLE));
        encrypted.decrypt("reader-pass").unwrap();

        std::fs::remove_file(path).unwrap();
    }
}
