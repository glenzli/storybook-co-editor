use std::fs::File;
use std::path::Path;
use uuid::Uuid;
use walkdir::WalkDir;
use zip::write::FileOptions;
use zip::{ZipArchive, ZipWriter};

pub fn extract(archive_path: &str, workspace_dir: &Path) -> Result<(), String> {
    let file =
        File::open(archive_path).map_err(|error| format!("Failed to open archive: {}", error))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Failed to read archive: {}", error))?;

    for index in 0..archive.len() {
        let mut archived_file = archive.by_index(index).map_err(|error| error.to_string())?;
        let Some(enclosed_name) = archived_file.enclosed_name() else {
            continue;
        };
        let output_path = workspace_dir.join(enclosed_name);

        if archived_file.name().ends_with('/') {
            std::fs::create_dir_all(&output_path).map_err(|error| error.to_string())?;
            continue;
        }
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut output_file = File::create(output_path).map_err(|error| error.to_string())?;
        std::io::copy(&mut archived_file, &mut output_file).map_err(|error| error.to_string())?;
    }

    Ok(())
}

pub fn write(
    workspace_dir: &Path,
    target_path: &str,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<(), String> {
    let temp_path = format!("{}.{}.tmp", target_path, Uuid::new_v4());
    let file = File::create(&temp_path)
        .map_err(|error| format!("Failed to create temp file: {}", error))?;
    let mut zip = ZipWriter::new(file);
    let options = FileOptions::<()>::default()
        .compression_method(zip::CompressionMethod::Stored)
        .unix_permissions(0o755);
    let entries: Vec<_> = WalkDir::new(workspace_dir)
        .into_iter()
        .filter_map(Result::ok)
        .collect();
    let total = entries.len();

    for (index, entry) in entries.into_iter().enumerate() {
        let path = entry.path();
        let name = path
            .strip_prefix(workspace_dir)
            .map_err(|error| error.to_string())?;
        let name = name.to_string_lossy().replace('\\', "/");
        if name.contains(".DS_Store") {
            continue;
        }
        if name == "codex-candidates" || name.starts_with("codex-candidates/") {
            continue;
        }

        let result = if path.is_file() {
            zip.start_file(&name, options)
                .map_err(|error| format!("Failed to start zip file {}: {}", name, error))
                .and_then(|_| {
                    let mut input = File::open(path)
                        .map_err(|error| format!("Failed to open file {}: {}", name, error))?;
                    std::io::copy(&mut input, &mut zip)
                        .map(|_| ())
                        .map_err(|error| format!("Failed to copy file {}: {}", name, error))
                })
        } else if path.is_dir() && !name.is_empty() {
            zip.add_directory(&name, options)
                .map_err(|error| format!("Failed to add directory {}: {}", name, error))
        } else {
            Ok(())
        };

        if let Err(error) = result {
            let _ = std::fs::remove_file(&temp_path);
            return Err(error);
        }

        if total > 0 && (index % 10 == 0 || index == total - 1) {
            on_progress(index + 1, total);
        }
    }

    if let Err(error) = zip.finish() {
        let _ = std::fs::remove_file(&temp_path);
        return Err(format!("Failed to finish zip: {}", error));
    }

    std::fs::rename(&temp_path, target_path)
        .map_err(|error| format!("Failed to atomic rename project file: {}", error))
}

#[cfg(test)]
mod tests {
    use super::{extract, write};
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn project_archive_round_trips_workspace_files() {
        let root = std::env::temp_dir().join(format!("storybook-archive-{}", Uuid::new_v4()));
        let source = root.join("source");
        let extracted = root.join("extracted");
        let archive = root.join("project.scproj");
        fs::create_dir_all(source.join("trash")).unwrap();
        fs::create_dir_all(source.join("codex-candidates")).unwrap();
        fs::write(source.join("project.json"), br#"{"schema_version":2}"#).unwrap();
        fs::write(source.join("cover.png"), b"image-bytes").unwrap();
        fs::write(source.join("trash").join("old.png"), b"trash-bytes").unwrap();
        fs::write(
            source.join("codex-candidates").join("preview.png"),
            b"candidate-bytes",
        )
        .unwrap();

        let mut final_progress = None;
        write(&source, archive.to_str().unwrap(), |current, total| {
            final_progress = Some((current, total));
        })
        .unwrap();
        fs::create_dir_all(&extracted).unwrap();
        extract(archive.to_str().unwrap(), &extracted).unwrap();

        assert_eq!(
            fs::read(extracted.join("project.json")).unwrap(),
            br#"{"schema_version":2}"#
        );
        assert_eq!(
            fs::read(extracted.join("cover.png")).unwrap(),
            b"image-bytes"
        );
        assert_eq!(
            fs::read(extracted.join("trash").join("old.png")).unwrap(),
            b"trash-bytes"
        );
        assert!(!extracted.join("codex-candidates").exists());
        assert!(final_progress.is_some());

        fs::remove_dir_all(root).unwrap();
    }
}
