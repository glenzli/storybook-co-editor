use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;
use zip::write::FileOptions;
use zip::ZipWriter;

const MAX_ASSET_BYTES: usize = 64 * 1024 * 1024;
const MAX_PACKAGE_BYTES: usize = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES: usize = 16 * 1024 * 1024;
const PUBLICATION_FORMAT_VERSION: &str = "20260906.01";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicationArchiveAsset {
    path: String,
    data_base64: String,
}

#[derive(Debug, Serialize)]
pub struct PublicationWriteResult {
    path: String,
    bytes: u64,
    sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestEnvelope {
    format: String,
    format_version: String,
    default_language: String,
    languages: Vec<ManifestLanguage>,
    canvas: ManifestCanvas,
    font_pack: ManifestFontPack,
    pages: Vec<ManifestPage>,
    resources: Vec<ManifestResource>,
    integrity: ManifestIntegrity,
}

#[derive(Debug, Deserialize)]
struct ManifestCanvas {
    width: u64,
    height: u64,
}

#[derive(Debug, Deserialize)]
struct ManifestFontPack {
    id: String,
    version: String,
    compatibility: String,
}

#[derive(Debug, Deserialize)]
struct ManifestPage {
    id: String,
    image: ManifestPageImage,
}

#[derive(Debug, Deserialize)]
struct ManifestLanguage {
    language: String,
    publication: Value,
    pages: Vec<ManifestLanguagePage>,
}

#[derive(Debug, Deserialize)]
struct ManifestLanguagePage {
    id: String,
}

#[derive(Debug, Deserialize)]
struct ManifestPageImage {
    src: String,
    bytes: usize,
    sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestResource {
    path: String,
    mime_type: String,
    bytes: usize,
    sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestIntegrity {
    algorithm: String,
    publication_sha256: String,
}

fn invalid(detail: impl std::fmt::Display) -> String {
    format!("PUBLICATION_PACKAGE_INVALID|{detail}")
}

fn write_failed(detail: impl std::fmt::Display) -> String {
    format!("PUBLICATION_PACKAGE_WRITE_FAILED|{detail}")
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn is_safe_page_path(value: &str) -> bool {
    if value.starts_with('/') || value.contains('\\') {
        return false;
    }
    let parts: Vec<_> = value.split('/').collect();
    parts.len() == 2
        && parts[0] == "pages"
        && !parts[1].is_empty()
        && parts[1] != "."
        && parts[1] != ".."
        && parts[1].to_ascii_lowercase().ends_with(".webp")
}

fn validate_target_path(target_path: &str) -> Result<PathBuf, String> {
    let target = PathBuf::from(target_path);
    let valid_extension = target
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("scpub"));
    if target_path.trim().is_empty() || target.file_name().is_none() || !valid_extension {
        return Err(invalid("output path must end in .scpub"));
    }
    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    if !parent.is_dir() {
        return Err(invalid("output directory does not exist"));
    }
    Ok(target)
}

fn validate_manifest(
    manifest_json: &str,
) -> Result<(ManifestEnvelope, BTreeMap<String, ManifestResource>), String> {
    let mut value: Value = serde_json::from_str(manifest_json)
        .map_err(|error| invalid(format!("manifest.json is invalid: {error}")))?;
    let manifest: ManifestEnvelope = serde_json::from_value(value.clone())
        .map_err(|error| invalid(format!("manifest.json does not match the schema: {error}")))?;

    if manifest.format != "storybook-publication"
        || manifest.format_version != PUBLICATION_FORMAT_VERSION
    {
        return Err(invalid("unsupported publication format"));
    }
    if manifest.canvas.width == 0 || manifest.canvas.height == 0 {
        return Err(invalid("canvas is invalid"));
    }
    if manifest.default_language.is_empty() {
        return Err(invalid("default language is missing"));
    }
    if manifest.languages.is_empty() {
        return Err(invalid("publication languages are missing"));
    }
    let mut language_tags = HashSet::new();
    for language in &manifest.languages {
        if language.language.is_empty()
            || !language.publication.is_object()
            || !language_tags.insert(language.language.as_str())
        {
            return Err(invalid("publication language is invalid"));
        }
        if language.pages.len() != manifest.pages.len()
            || language
                .pages
                .iter()
                .zip(&manifest.pages)
                .any(|(language_page, page)| language_page.id != page.id)
        {
            return Err(invalid(
                "publication language pages do not match artwork pages",
            ));
        }
    }
    if !language_tags.contains(manifest.default_language.as_str()) {
        return Err(invalid("default language is not included"));
    }
    if manifest.font_pack.id != "glenzli-books-webfonts"
        || manifest.font_pack.version != "1"
        || manifest.font_pack.compatibility != "storybook-co-editor-fonts-v1"
    {
        return Err(invalid("unsupported font pack"));
    }
    if manifest.integrity.algorithm != "sha256"
        || !is_sha256(&manifest.integrity.publication_sha256)
    {
        return Err(invalid("manifest integrity is invalid"));
    }

    value
        .as_object_mut()
        .ok_or_else(|| invalid("manifest.json must be an object"))?
        .remove("integrity");
    let canonical = serde_json::to_vec(&value)
        .map_err(|error| invalid(format!("manifest cannot be canonicalized: {error}")))?;
    if sha256_hex(&canonical) != manifest.integrity.publication_sha256 {
        return Err(invalid(
            "publication digest does not match manifest content",
        ));
    }

    if manifest.pages.len() != manifest.resources.len() {
        return Err(invalid("each page must have one artwork resource"));
    }

    let mut resources = BTreeMap::new();
    for resource in &manifest.resources {
        if !is_safe_page_path(&resource.path)
            || resource.mime_type != "image/webp"
            || resource.bytes > MAX_ASSET_BYTES
            || !is_sha256(&resource.sha256)
        {
            return Err(invalid(format!("invalid resource {}", resource.path)));
        }
        if resources
            .insert(resource.path.clone(), resource.clone())
            .is_some()
        {
            return Err(invalid(format!("duplicate resource {}", resource.path)));
        }
    }

    for page in &manifest.pages {
        let resource = resources
            .get(&page.image.src)
            .ok_or_else(|| invalid(format!("page resource {} is missing", page.image.src)))?;
        if page.image.bytes != resource.bytes || page.image.sha256 != resource.sha256 {
            return Err(invalid(format!(
                "page resource {} does not match",
                page.image.src
            )));
        }
    }

    Ok((manifest, resources))
}

impl Clone for ManifestResource {
    fn clone(&self) -> Self {
        Self {
            path: self.path.clone(),
            mime_type: self.mime_type.clone(),
            bytes: self.bytes,
            sha256: self.sha256.clone(),
        }
    }
}

fn write_package(
    target_path: &str,
    manifest_json: &str,
    assets: Vec<PublicationArchiveAsset>,
) -> Result<PublicationWriteResult, String> {
    let target = validate_target_path(target_path)?;
    if manifest_json.len() > MAX_MANIFEST_BYTES {
        return Err(invalid("manifest.json is too large"));
    }
    let (_manifest, resources) = validate_manifest(manifest_json)?;
    if assets.len() != resources.len() {
        return Err(invalid("archive assets do not match manifest resources"));
    }

    let mut decoded_assets = BTreeMap::new();
    let mut total_bytes = manifest_json.len();
    for asset in assets {
        if !is_safe_page_path(&asset.path) || !resources.contains_key(&asset.path) {
            return Err(invalid(format!("unexpected asset {}", asset.path)));
        }
        if asset.data_base64.len() > (MAX_ASSET_BYTES * 4 / 3) + 4 {
            return Err(invalid(format!("asset {} is too large", asset.path)));
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(asset.data_base64)
            .map_err(|error| {
                invalid(format!("asset {} is not valid base64: {error}", asset.path))
            })?;
        let resource = &resources[&asset.path];
        if bytes.len() != resource.bytes || sha256_hex(&bytes) != resource.sha256 {
            return Err(invalid(format!(
                "asset {} digest does not match",
                asset.path
            )));
        }
        total_bytes = total_bytes
            .checked_add(bytes.len())
            .ok_or_else(|| invalid("package size overflow"))?;
        if total_bytes > MAX_PACKAGE_BYTES {
            return Err(invalid("package is too large"));
        }
        if decoded_assets.insert(asset.path.clone(), bytes).is_some() {
            return Err(invalid(format!("duplicate asset {}", asset.path)));
        }
    }

    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| invalid("output filename is invalid"))?;
    let temp_path = parent.join(format!(".{file_name}.{}.tmp", Uuid::new_v4()));

    let write_result = (|| -> Result<(), String> {
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(write_failed)?;
        let mut zip = ZipWriter::new(file);
        let options = FileOptions::<()>::default()
            .compression_method(zip::CompressionMethod::Stored)
            .unix_permissions(0o644);
        zip.start_file("manifest.json", options)
            .map_err(write_failed)?;
        zip.write_all(manifest_json.as_bytes())
            .map_err(write_failed)?;
        for (path, bytes) in decoded_assets {
            zip.start_file(path, options).map_err(write_failed)?;
            zip.write_all(&bytes).map_err(write_failed)?;
        }
        let file = zip.finish().map_err(write_failed)?;
        file.sync_all().map_err(write_failed)?;
        std::fs::rename(&temp_path, &target).map_err(write_failed)?;
        Ok(())
    })();

    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&temp_path);
        return Err(error);
    }

    let mut file = File::open(&target).map_err(write_failed)?;
    let bytes = file.metadata().map_err(write_failed)?.len();
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(write_failed)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(PublicationWriteResult {
        path: target.to_string_lossy().into_owned(),
        bytes,
        sha256: hex::encode(hasher.finalize()),
    })
}

#[tauri::command]
pub fn write_publication_package(
    target_path: String,
    manifest_json: String,
    assets: Vec<PublicationArchiveAsset>,
) -> Result<PublicationWriteResult, String> {
    write_package(&target_path, &manifest_json, assets)
}

#[cfg(test)]
mod tests {
    use super::{sha256_hex, write_package, PublicationArchiveAsset, PUBLICATION_FORMAT_VERSION};
    use base64::Engine;
    use serde_json::json;
    use std::fs::{self, File};
    use std::io::Read;
    use uuid::Uuid;
    use zip::ZipArchive;

    fn manifest_for(asset: &[u8]) -> String {
        let asset_sha = sha256_hex(asset);
        let mut value = json!({
            "format": "storybook-publication",
            "formatVersion": PUBLICATION_FORMAT_VERSION,
            "createdAt": "2026-09-04T00:00:00Z",
            "defaultLanguage": "en",
            "languages": [{
                "language": "en",
                "publication": {
                    "id": "publication-fixture",
                    "title": "Fixture",
                    "contributors": [],
                    "language": "en",
                    "readingDirection": "ltr",
                    "description": null,
                    "keywords": [],
                    "publisher": null,
                    "publicationDate": null,
                    "edition": null,
                    "copyrightHolder": null,
                    "copyrightYear": null,
                    "copyrightNotice": null,
                    "license": { "name": null, "url": null },
                    "identifiers": []
                },
                "pages": [{
                    "id": "page-fixture",
                    "role": "cover",
                    "textLayers": []
                }]
            }],
            "canvas": { "width": 64, "height": 64 },
            "fontPack": {
                "id": "glenzli-books-webfonts",
                "version": "1",
                "compatibility": "storybook-co-editor-fonts-v1"
            },
            "pages": [{
                "id": "page-fixture",
                "order": 0,
                "image": {
                    "src": "pages/0001.webp",
                    "width": 64,
                    "height": 64,
                    "alt": null,
                    "mimeType": "image/webp",
                    "bytes": asset.len(),
                    "sha256": asset_sha
                }
            }],
            "resources": [{
                "path": "pages/0001.webp",
                "mimeType": "image/webp",
                "bytes": asset.len(),
                "sha256": asset_sha
            }]
        });
        let canonical = serde_json::to_vec(&value).unwrap();
        value.as_object_mut().unwrap().insert(
            "integrity".into(),
            json!({ "algorithm": "sha256", "publicationSha256": sha256_hex(&canonical) }),
        );
        serde_json::to_string_pretty(&value).unwrap()
    }

    fn asset(path: &str, bytes: &[u8]) -> PublicationArchiveAsset {
        PublicationArchiveAsset {
            path: path.into(),
            data_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        }
    }

    #[test]
    fn writes_valid_publication_zip() {
        let root = std::env::temp_dir().join(format!("storybook-publication-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let target = root.join("fixture.scpub");
        let artwork = include_bytes!("../../../fixtures/publication-20260906.01/pages/0001.webp");
        let manifest = include_str!("../../../fixtures/publication-20260906.01/manifest.json");

        let result = write_package(
            target.to_str().unwrap(),
            manifest,
            vec![asset("pages/0001.webp", artwork)],
        )
        .unwrap();
        assert!(result.bytes > artwork.len() as u64);
        assert_eq!(result.sha256.len(), 64);

        let mut archive = ZipArchive::new(File::open(&target).unwrap()).unwrap();
        assert_eq!(archive.len(), 2);
        let mut stored_manifest = String::new();
        archive
            .by_name("manifest.json")
            .unwrap()
            .read_to_string(&mut stored_manifest)
            .unwrap();
        assert_eq!(stored_manifest, manifest);
        let mut stored_artwork = Vec::new();
        archive
            .by_name("pages/0001.webp")
            .unwrap()
            .read_to_end(&mut stored_artwork)
            .unwrap();
        assert_eq!(stored_artwork, artwork);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_unsafe_or_changed_assets() {
        let root = std::env::temp_dir().join(format!("storybook-publication-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let target = root.join("fixture.scpub");
        let manifest = manifest_for(b"expected");

        let unsafe_result = write_package(
            target.to_str().unwrap(),
            &manifest,
            vec![asset("../0001.webp", b"expected")],
        );
        assert!(unsafe_result.unwrap_err().contains("unexpected asset"));

        let changed_result = write_package(
            target.to_str().unwrap(),
            &manifest,
            vec![asset("pages/0001.webp", b"changed")],
        );
        assert!(changed_result
            .unwrap_err()
            .contains("digest does not match"));
        assert!(!target.exists());

        fs::remove_dir_all(root).unwrap();
    }
}
