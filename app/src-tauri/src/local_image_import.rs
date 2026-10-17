use crate::project_manager::ProjectManager;
use crate::project_storage;
use image::{DynamicImage, GenericImageView, ImageDecoder, ImageFormat, ImageReader, RgbaImage};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Cursor, Read};
use std::path::Path;
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use uuid::Uuid;

const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_PIXELS: u64 = 64_000_000;
const MAX_DIMENSION: u32 = 16_384;
const MAX_FILES: usize = 200;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ImportStatus {
    New,
    Duplicate,
    Trashed,
}

#[derive(Debug, Serialize)]
pub struct ImportedImage {
    filename: String,
    width: u32,
    height: u32,
    status: ImportStatus,
}

#[derive(Debug, Serialize)]
pub struct ImportFailure {
    name: String,
    error: String,
}

#[derive(Debug, Default, Serialize)]
pub struct ImageImportResult {
    images: Vec<ImportedImage>,
    failures: Vec<ImportFailure>,
}

struct PreparedImage {
    bytes: Vec<u8>,
    extension: &'static str,
    width: u32,
    height: u32,
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0
        || height == 0
        || width > MAX_DIMENSION
        || height > MAX_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_PIXELS
    {
        return Err("IMAGE_IMPORT_DIMENSIONS".to_string());
    }
    Ok(())
}

fn encode_png(image: DynamicImage) -> Result<PreparedImage, String> {
    let (width, height) = image.dimensions();
    validate_dimensions(width, height)?;
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|_| "IMAGE_IMPORT_INVALID".to_string())?;
    let bytes = output.into_inner();
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("IMAGE_IMPORT_TOO_LARGE".to_string());
    }
    Ok(PreparedImage {
        bytes,
        extension: "png",
        width,
        height,
    })
}

fn prepare_image(bytes: Vec<u8>) -> Result<PreparedImage, String> {
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("IMAGE_IMPORT_TOO_LARGE".to_string());
    }
    let mut reader = ImageReader::new(Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|_| "IMAGE_IMPORT_INVALID".to_string())?;
    let format = reader
        .format()
        .ok_or_else(|| "IMAGE_IMPORT_UNSUPPORTED".to_string())?;
    let extension = match format {
        ImageFormat::Png => "png",
        ImageFormat::Jpeg => "jpg",
        ImageFormat::WebP => "webp",
        ImageFormat::Gif => "gif",
        ImageFormat::Bmp | ImageFormat::Tiff => "png",
        _ => return Err("IMAGE_IMPORT_UNSUPPORTED".to_string()),
    };
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_DIMENSION);
    limits.max_image_height = Some(MAX_DIMENSION);
    limits.max_alloc = Some(MAX_PIXELS * 4);
    reader.limits(limits);
    let mut decoder = reader
        .into_decoder()
        .map_err(|_| "IMAGE_IMPORT_INVALID".to_string())?;
    let (width, height) = decoder.dimensions();
    validate_dimensions(width, height)?;
    let orientation = decoder
        .orientation()
        .unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut decoded =
        DynamicImage::from_decoder(decoder).map_err(|_| "IMAGE_IMPORT_INVALID".to_string())?;
    decoded.apply_orientation(orientation);
    let (width, height) = decoded.dimensions();

    // Keep browser-readable originals, including their color profiles and animation.
    // TIFF and BMP become PNG so the editor and exported publications can display them.
    if matches!(format, ImageFormat::Bmp | ImageFormat::Tiff) {
        return encode_png(decoded);
    }
    Ok(PreparedImage {
        bytes,
        extension,
        width,
        height,
    })
}

fn prepare_file(path: &Path) -> Result<PreparedImage, String> {
    let metadata = fs::metadata(path).map_err(|_| "IMAGE_IMPORT_READ_FAILED".to_string())?;
    if !metadata.is_file() {
        return Err("IMAGE_IMPORT_NOT_FILE".to_string());
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Err("IMAGE_IMPORT_TOO_LARGE".to_string());
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|_| "IMAGE_IMPORT_READ_FAILED".to_string())?
        .take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "IMAGE_IMPORT_READ_FAILED".to_string())?;
    prepare_image(bytes)
}

fn prepare_clipboard(width: u32, height: u32, rgba: &[u8]) -> Result<PreparedImage, String> {
    validate_dimensions(width, height)?;
    if rgba.len() as u64 != u64::from(width) * u64::from(height) * 4 {
        return Err("IMAGE_IMPORT_INVALID".to_string());
    }
    let image = RgbaImage::from_raw(width, height, rgba.to_vec())
        .ok_or_else(|| "IMAGE_IMPORT_INVALID".to_string())?;
    encode_png(DynamicImage::ImageRgba8(image))
}

fn persist_image(workspace: &Path, image: PreparedImage) -> Result<ImportedImage, String> {
    let filename = format!("{:x}.{}", Sha256::digest(&image.bytes), image.extension);
    let destination = workspace.join(&filename);
    let status = if workspace.join("trash").join(&filename).is_file() {
        ImportStatus::Trashed
    } else if destination.is_file() {
        ImportStatus::Duplicate
    } else {
        let temporary = workspace.join(format!(".image-import-{}", Uuid::new_v4()));
        let written =
            fs::write(&temporary, &image.bytes).and_then(|()| fs::rename(&temporary, &destination));
        if written.is_err() {
            let _ = fs::remove_file(&temporary);
            return Err("IMAGE_IMPORT_WRITE_FAILED".to_string());
        }
        ImportStatus::New
    };
    Ok(ImportedImage {
        filename,
        width: image.width,
        height: image.height,
        status,
    })
}

fn import_files(workspace: &Path, paths: Vec<String>) -> Result<ImageImportResult, String> {
    if paths.len() > MAX_FILES {
        return Err("IMAGE_IMPORT_TOO_MANY".to_string());
    }
    let mut result = ImageImportResult::default();
    for path in paths {
        let path = Path::new(&path);
        match prepare_file(path).and_then(|image| persist_image(workspace, image)) {
            Ok(image) => result.images.push(image),
            Err(error) => result.failures.push(ImportFailure {
                name: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                error,
            }),
        }
    }
    Ok(result)
}

async fn in_workspace<F>(
    app: AppHandle,
    workspace_id: String,
    import: F,
) -> Result<ImageImportResult, String>
where
    F: FnOnce(&AppHandle, &Path) -> Result<ImageImportResult, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let manager = app.state::<ProjectManager>();
        let _guard = manager
            .operation_lock
            .lock()
            .map_err(|_| "PROJECT_LOCK_POISONED")?;
        if manager
            .active_workspace
            .lock()
            .map_err(|_| "PROJECT_LOCK_POISONED")?
            .as_deref()
            != Some(workspace_id.as_str())
        {
            return Err("IMAGE_IMPORT_PROJECT_CHANGED".to_string());
        }
        let workspace = project_storage::get_workspace_dir(&app, &workspace_id)?;
        import(&app, &workspace)
    })
    .await
    .map_err(|_| "IMAGE_IMPORT_FAILED".to_string())?
}

#[tauri::command]
pub async fn import_local_images(
    app: AppHandle,
    workspace_id: String,
    paths: Vec<String>,
) -> Result<ImageImportResult, String> {
    in_workspace(app, workspace_id, move |_, workspace| {
        import_files(workspace, paths)
    })
    .await
}

#[tauri::command]
pub async fn import_clipboard_image(
    app: AppHandle,
    workspace_id: String,
) -> Result<ImageImportResult, String> {
    in_workspace(app, workspace_id, |app, workspace| {
        let image = app
            .clipboard()
            .read_image()
            .map_err(|_| "IMAGE_IMPORT_CLIPBOARD_EMPTY")?;
        let prepared = prepare_clipboard(image.width(), image.height(), image.rgba())?;
        Ok(ImageImportResult {
            images: vec![persist_image(workspace, prepared)?],
            failures: vec![],
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Workspace(std::path::PathBuf);
    impl Workspace {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("storybook-import-{}", Uuid::new_v4()));
            fs::create_dir_all(path.join("trash")).unwrap();
            Self(path)
        }
    }
    impl Drop for Workspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn png(color: u8) -> Vec<u8> {
        prepare_clipboard(2, 1, &[color, 0, 10, 255, 10, color, 30, 128])
            .unwrap()
            .bytes
    }

    #[test]
    fn batch_keeps_order_and_originals_while_reporting_individual_failures() {
        let source = Workspace::new();
        let destination = Workspace::new();
        let first = source.0.join("封面.JPEG");
        let second = source.0.join("第 2 页.png");
        let invalid = source.0.join("broken.png");
        fs::write(&first, png(1)).unwrap();
        fs::write(&second, png(2)).unwrap();
        fs::write(&invalid, b"not an image").unwrap();
        let result = import_files(
            &destination.0,
            [&second, &invalid, &first, &source.0]
                .map(|path| path.to_string_lossy().into_owned())
                .to_vec(),
        )
        .unwrap();
        assert_eq!(result.images.len(), 2);
        assert_eq!(result.failures.len(), 2);
        assert_eq!(result.failures[0].name, "broken.png");
        assert_eq!(result.failures[1].error, "IMAGE_IMPORT_NOT_FILE");
        for (imported, original) in result.images.iter().zip([&second, &first]) {
            assert!(imported.filename.ends_with(".png"));
            assert_eq!(
                fs::read(destination.0.join(&imported.filename)).unwrap(),
                fs::read(original).unwrap()
            );
        }
    }

    #[test]
    fn repeated_imports_and_trash_do_not_overwrite_or_duplicate_assets() {
        let workspace = Workspace::new();
        let first = persist_image(&workspace.0, prepare_image(png(1)).unwrap()).unwrap();
        assert_eq!(first.status, ImportStatus::New);
        let second = persist_image(&workspace.0, prepare_image(png(1)).unwrap()).unwrap();
        assert_eq!(first.filename, second.filename);
        assert_eq!(second.status, ImportStatus::Duplicate);
        fs::rename(
            workspace.0.join(&first.filename),
            workspace.0.join("trash").join(&first.filename),
        )
        .unwrap();
        let third = persist_image(&workspace.0, prepare_image(png(1)).unwrap()).unwrap();
        assert_eq!(third.status, ImportStatus::Trashed);
        assert!(!workspace.0.join(&first.filename).exists());
    }

    #[test]
    fn clipboard_alpha_and_tiff_are_readable_pngs() {
        let prepared = prepare_clipboard(2, 1, &[5, 10, 20, 0, 30, 40, 50, 128]).unwrap();
        let decoded = image::load_from_memory(&prepared.bytes).unwrap();
        assert_eq!(
            decoded.to_rgba8().as_raw(),
            &[5, 10, 20, 0, 30, 40, 50, 128]
        );
        let mut tiff = Cursor::new(Vec::new());
        decoded.write_to(&mut tiff, ImageFormat::Tiff).unwrap();
        let imported = prepare_image(tiff.into_inner()).unwrap();
        assert_eq!(
            image::guess_format(&imported.bytes).unwrap(),
            ImageFormat::Png
        );
        assert_eq!(
            image::load_from_memory(&imported.bytes).unwrap().to_rgba8(),
            decoded.to_rgba8()
        );
    }

    #[test]
    fn rejects_corrupt_oversized_and_unbounded_inputs_before_publishing() {
        assert!(prepare_image(vec![]).is_err());
        let mut truncated = png(1);
        truncated.truncate(30);
        assert!(prepare_image(truncated).is_err());
        assert!(prepare_clipboard(2, 1, &[0; 4]).is_err());
        assert!(validate_dimensions(MAX_DIMENSION + 1, 1).is_err());
        assert!(validate_dimensions(MAX_DIMENSION, MAX_DIMENSION).is_err());
        let workspace = Workspace::new();
        let oversized = workspace.0.join("large.png");
        File::create(&oversized)
            .unwrap()
            .set_len(MAX_FILE_BYTES + 1)
            .unwrap();
        assert_eq!(
            prepare_file(&oversized).err().unwrap(),
            "IMAGE_IMPORT_TOO_LARGE"
        );
        assert!(import_files(&workspace.0, vec![String::new(); MAX_FILES + 1]).is_err());
    }

    #[test]
    fn imported_assets_survive_source_removal_and_project_archive_round_trip() {
        let source = Workspace::new();
        let workspace = Workspace::new();
        let reopened = Workspace::new();
        let input = source.0.join("page.png");
        let pixels = png(5);
        fs::write(&input, &pixels).unwrap();
        let result =
            import_files(&workspace.0, vec![input.to_string_lossy().into_owned()]).unwrap();
        let filename = result.images[0].filename.clone();
        fs::remove_file(input).unwrap();
        let state = crate::project_model::ProjectState {
            visible_images: vec![filename.clone()],
            ..Default::default()
        };
        project_storage::save_state(&workspace.0, &state).unwrap();
        let archive = source.0.join("book.scproj");
        crate::project_archive::write(&workspace.0, archive.to_str().unwrap(), |_, _| {}).unwrap();
        crate::project_archive::extract(archive.to_str().unwrap(), &reopened.0).unwrap();
        assert_eq!(
            project_storage::load_state(&reopened.0)
                .unwrap()
                .visible_images,
            vec![filename.clone()]
        );
        assert_eq!(fs::read(reopened.0.join(filename)).unwrap(), pixels);
    }
}
