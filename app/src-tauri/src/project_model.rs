use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct TextSettings {
    pub font_family: String,
    pub font_size: f64,
    pub text_color: String,
    pub has_shadow: bool,
    pub has_backdrop: bool,
    pub offset_x: f64,
    pub offset_y: f64,
    pub paper_alignment: String,
    pub auto_snap_content: bool,
}

impl Default for TextSettings {
    fn default() -> Self {
        Self {
            font_family: "serif".to_string(),
            font_size: 20.0,
            text_color: "#ffffff".to_string(),
            has_shadow: true,
            has_backdrop: false,
            offset_x: 0.0,
            offset_y: 0.0,
            paper_alignment: "left".to_string(),
            auto_snap_content: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct PageTextOverride {
    #[serde(default)]
    pub offset_x: f64,
    #[serde(default)]
    pub offset_y: f64,
    #[serde(default)]
    pub text_color: Option<String>,
}

fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct PageSettings {
    #[serde(default, skip_serializing_if = "is_false")]
    pub print_only: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct PrintSettings {
    pub paper_size: String,
    pub paper_orientation: String,
    pub book_size: String,
    pub layout_mode: String,
    pub binding_method: String,
    pub has_back_cover: bool,
    pub spine_mm: f64,
    pub binding_margin_mm: f64,
    pub hardware_margin_mm: f64,
    pub crop_marks: bool,
    pub double_sided: bool,
    pub offset_x: f64,
    pub offset_y: f64,
    pub paper_alignment: String,
    pub auto_snap_content: bool,
}

impl Default for PrintSettings {
    fn default() -> Self {
        Self {
            paper_size: "A4".to_string(),
            paper_orientation: "portrait".to_string(),
            book_size: "A5".to_string(),
            layout_mode: "2-up".to_string(),
            binding_method: "perfect".to_string(),
            has_back_cover: false,
            spine_mm: 5.0,
            binding_margin_mm: 10.0,
            hardware_margin_mm: 0.0,
            crop_marks: true,
            double_sided: true,
            offset_x: 0.0,
            offset_y: 0.0,
            paper_alignment: "left".to_string(),
            auto_snap_content: true,
        }
    }
}

fn default_canvas_size() -> u32 {
    1024
}

fn default_scale() -> f64 {
    1.0
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SelectiveColor {
    pub id: String,
    pub target_hue: f64,
    pub d_hue: f64,
    pub d_sat: f64,
    pub d_lum: f64,
    #[serde(default)]
    pub range: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ImageAdjustments {
    #[serde(default)]
    pub offset_x: f64,
    #[serde(default)]
    pub offset_y: f64,
    #[serde(default = "default_scale")]
    pub scale: f64,
    #[serde(default)]
    pub bg_color: Option<String>,
    #[serde(default)]
    pub brightness: f64,
    #[serde(default)]
    pub exposure: f64,
    #[serde(default)]
    pub highlights: f64,
    #[serde(default)]
    pub shadows: f64,
    #[serde(default)]
    pub contrast: f64,
    #[serde(default)]
    pub saturate: f64,
    #[serde(default)]
    pub temperature: f64,
    #[serde(default)]
    pub tint: f64,
    #[serde(default)]
    pub selective_colors: Option<Vec<SelectiveColor>>,
    #[serde(default)]
    pub remove_white_bg: f64,
    #[serde(default)]
    pub remove_bg_color: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct PublicationContributor {
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct PublicationIdentifier {
    #[serde(default)]
    pub scheme: String,
    #[serde(default)]
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct PublicationMetadata {
    #[serde(default)]
    pub version: Option<u32>,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub contributors: Vec<PublicationContributor>,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub keywords: Vec<String>,
    #[serde(default)]
    pub publisher: String,
    #[serde(default)]
    pub publication_date: String,
    #[serde(default)]
    pub copyright_holder: String,
    #[serde(default)]
    pub copyright_year: String,
    #[serde(default)]
    pub copyright_notice: String,
    #[serde(default)]
    pub license_name: String,
    #[serde(default)]
    pub license_url: String,
    #[serde(default)]
    pub identifiers: Vec<PublicationIdentifier>,
    #[serde(default)]
    pub copyright_page_mode: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct ElectronicPdfSettings {
    pub version: Option<u32>,
    pub preset: String,
    pub encryption_enabled: bool,
    pub printing: String,
    pub allow_copying: bool,
    pub allow_modification: bool,
    pub allow_annotations: bool,
}

impl Default for ElectronicPdfSettings {
    fn default() -> Self {
        Self {
            version: Some(1),
            preset: "screen".to_string(),
            encryption_enabled: true,
            printing: "none".to_string(),
            allow_copying: false,
            allow_modification: false,
            allow_annotations: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProjectState {
    #[serde(default)]
    pub schema_version: Option<u32>,
    pub project_name: String,
    pub last_modified: String,
    pub visible_images: Vec<String>,
    pub trashed_images: Vec<String>,
    #[serde(default)]
    pub source_url_map: HashMap<String, String>,
    pub global_script: String,
    #[serde(default)]
    pub cover_text_settings: TextSettings,
    #[serde(default)]
    pub title_text_settings: TextSettings,
    #[serde(default)]
    pub inner_text_settings: TextSettings,
    #[serde(default)]
    pub image_adjustments: HashMap<String, ImageAdjustments>,
    #[serde(default)]
    pub print_settings: PrintSettings,
    #[serde(default = "default_canvas_size")]
    pub canvas_width: u32,
    #[serde(default = "default_canvas_size")]
    pub canvas_height: u32,
    #[serde(default)]
    pub author_text_settings: TextSettings,
    #[serde(default)]
    pub page_text_overrides: HashMap<String, PageTextOverride>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub page_settings: HashMap<String, PageSettings>,
    #[serde(default)]
    pub publication_metadata: Option<PublicationMetadata>,
    #[serde(default)]
    pub electronic_pdf_settings: Option<ElectronicPdfSettings>,
}

impl Default for ProjectState {
    fn default() -> Self {
        Self {
            schema_version: Some(2),
            project_name: "Untitled".to_string(),
            last_modified: chrono::Utc::now().to_rfc3339(),
            visible_images: vec![],
            trashed_images: vec![],
            source_url_map: HashMap::new(),
            global_script: "".to_string(),
            cover_text_settings: TextSettings {
                font_size: 40.0,
                ..TextSettings::default()
            },
            title_text_settings: TextSettings {
                font_size: 32.0,
                ..TextSettings::default()
            },
            inner_text_settings: TextSettings::default(),
            image_adjustments: HashMap::new(),
            print_settings: PrintSettings::default(),
            canvas_width: default_canvas_size(),
            canvas_height: default_canvas_size(),
            author_text_settings: TextSettings {
                font_size: 16.0,
                ..TextSettings::default()
            },
            page_text_overrides: HashMap::new(),
            page_settings: HashMap::new(),
            publication_metadata: None,
            electronic_pdf_settings: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ProjectState;

    fn assert_json_equivalent(actual: &serde_json::Value, expected: &serde_json::Value) {
        match (actual, expected) {
            (serde_json::Value::Number(actual), serde_json::Value::Number(expected)) => {
                assert_eq!(actual.as_f64(), expected.as_f64());
            }
            (serde_json::Value::Array(actual), serde_json::Value::Array(expected)) => {
                assert_eq!(actual.len(), expected.len());
                for (actual, expected) in actual.iter().zip(expected) {
                    assert_json_equivalent(actual, expected);
                }
            }
            (serde_json::Value::Object(actual), serde_json::Value::Object(expected)) => {
                assert_eq!(
                    actual.keys().collect::<Vec<_>>(),
                    expected.keys().collect::<Vec<_>>()
                );
                for (key, expected) in expected {
                    assert_json_equivalent(&actual[key], expected);
                }
            }
            _ => assert_eq!(actual, expected),
        }
    }

    #[test]
    fn project_v2_fixture_round_trips_without_format_drift() {
        let source: serde_json::Value =
            serde_json::from_str(include_str!("../../../fixtures/project-v2.json")).unwrap();
        let state: ProjectState = serde_json::from_value(source.clone()).unwrap();
        let serialized = serde_json::to_value(state).unwrap();
        assert_json_equivalent(&serialized, &source);
    }

    #[test]
    fn project_v2_accepts_optional_print_only_page_settings() {
        let mut source: serde_json::Value =
            serde_json::from_str(include_str!("../../../fixtures/project-v2.json")).unwrap();
        source["page_settings"] = serde_json::json!({ "1": { "print_only": true } });

        let state: ProjectState = serde_json::from_value(source).unwrap();

        assert!(state.page_settings["1"].print_only);
        assert_eq!(state.schema_version, Some(2));
        let serialized = serde_json::to_value(state).unwrap();
        assert_eq!(serialized["page_settings"]["1"]["print_only"], true);
    }
}
