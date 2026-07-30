use font_kit::source::SystemSource;

#[tauri::command]
pub fn get_system_fonts() -> Result<Vec<String>, String> {
    let source = SystemSource::new();
    let mut fonts = source.all_families().unwrap_or_default();
    fonts.sort();
    fonts.dedup();
    Ok(fonts)
}
