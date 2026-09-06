use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const PROJECT_SCHEMA_VERSION: &str = "20260907.01";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(untagged)]
pub enum ProjectSchemaVersion {
    Legacy(u32),
    Dated(String),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TextEffects {
    pub outline: f64,
    pub halo: f64,
    pub backdrop: String,
    pub strength: f64,
    pub seed: u32,
    pub roughness: f64,
    pub feather: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct TextSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_effects: Option<TextEffects>,
    pub font_family: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<u16>,
    pub font_size: f64,
    pub text_color: String,
    pub has_shadow: bool,
    pub has_backdrop: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub readability_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub readability_strength: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_width_percent: Option<f64>,
    pub offset_x: f64,
    pub offset_y: f64,
    pub paper_alignment: String,
    pub auto_snap_content: bool,
}

impl Default for TextSettings {
    fn default() -> Self {
        Self {
            text_effects: None,
            font_family: "serif".to_string(),
            font_weight: None,
            font_size: 20.0,
            text_color: "#ffffff".to_string(),
            has_shadow: true,
            has_backdrop: false,
            readability_mode: None,
            readability_strength: None,
            max_width_percent: None,
            offset_x: 0.0,
            offset_y: 0.0,
            paper_alignment: "left".to_string(),
            auto_snap_content: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct PageTextOverride {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_effects: Option<TextEffects>,
    #[serde(default)]
    pub offset_x: f64,
    #[serde(default)]
    pub offset_y: f64,
    #[serde(default)]
    pub text_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub readability_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub readability_strength: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_width_percent: Option<f64>,
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

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct ProjectLanguage {
    pub script: String,
    pub cover_text_settings: TextSettings,
    pub title_text_settings: TextSettings,
    pub inner_text_settings: TextSettings,
    pub author_text_settings: TextSettings,
    pub page_text_overrides: HashMap<String, PageTextOverride>,
    pub publication_metadata: Option<PublicationMetadata>,
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
    pub schema_version: Option<ProjectSchemaVersion>,
    pub project_name: String,
    pub last_modified: String,
    pub visible_images: Vec<String>,
    pub trashed_images: Vec<String>,
    #[serde(default)]
    pub source_url_map: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_language: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub languages: HashMap<String, ProjectLanguage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub global_script: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_text_settings: Option<TextSettings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_text_settings: Option<TextSettings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inner_text_settings: Option<TextSettings>,
    #[serde(default)]
    pub image_adjustments: HashMap<String, ImageAdjustments>,
    #[serde(default)]
    pub print_settings: PrintSettings,
    #[serde(default = "default_canvas_size")]
    pub canvas_width: u32,
    #[serde(default = "default_canvas_size")]
    pub canvas_height: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_text_settings: Option<TextSettings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_text_overrides: Option<HashMap<String, PageTextOverride>>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub page_settings: HashMap<String, PageSettings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub publication_metadata: Option<PublicationMetadata>,
    #[serde(default)]
    pub electronic_pdf_settings: Option<ElectronicPdfSettings>,
}

impl Default for ProjectState {
    fn default() -> Self {
        let default_language = "zh-CN".to_string();
        let mut languages = HashMap::new();
        languages.insert(
            default_language.clone(),
            ProjectLanguage {
                script: String::new(),
                cover_text_settings: TextSettings {
                    font_size: 40.0,
                    ..TextSettings::default()
                },
                title_text_settings: TextSettings {
                    font_size: 32.0,
                    ..TextSettings::default()
                },
                inner_text_settings: TextSettings::default(),
                author_text_settings: TextSettings {
                    font_size: 16.0,
                    ..TextSettings::default()
                },
                page_text_overrides: HashMap::new(),
                publication_metadata: Some(PublicationMetadata {
                    version: Some(1),
                    language: default_language.clone(),
                    ..PublicationMetadata::default()
                }),
            },
        );
        Self {
            schema_version: Some(ProjectSchemaVersion::Dated(
                PROJECT_SCHEMA_VERSION.to_string(),
            )),
            project_name: "Untitled".to_string(),
            last_modified: chrono::Utc::now().to_rfc3339(),
            visible_images: vec![],
            trashed_images: vec![],
            source_url_map: HashMap::new(),
            default_language: Some(default_language),
            languages,
            global_script: None,
            cover_text_settings: None,
            title_text_settings: None,
            inner_text_settings: None,
            image_adjustments: HashMap::new(),
            print_settings: PrintSettings::default(),
            canvas_width: default_canvas_size(),
            canvas_height: default_canvas_size(),
            author_text_settings: None,
            page_text_overrides: None,
            page_settings: HashMap::new(),
            publication_metadata: None,
            electronic_pdf_settings: None,
        }
    }
}

impl ProjectState {
    pub fn default_language_tag(&self) -> String {
        if let Some(language) = self
            .default_language
            .as_ref()
            .filter(|language| self.languages.contains_key(*language))
        {
            return language.clone();
        }
        let mut languages: Vec<_> = self.languages.keys().cloned().collect();
        languages.sort();
        languages
            .into_iter()
            .next()
            .or_else(|| {
                self.publication_metadata
                    .as_ref()
                    .map(|metadata| metadata.language.clone())
                    .filter(|language| !language.is_empty())
            })
            .unwrap_or_else(|| "zh-CN".to_string())
    }

    pub fn language(&self, requested: Option<&str>) -> Option<&ProjectLanguage> {
        let language = requested
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| self.default_language_tag());
        self.languages.get(&language)
    }

    pub fn language_mut(
        &mut self,
        requested: Option<&str>,
    ) -> Result<&mut ProjectLanguage, String> {
        let language = requested
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| self.default_language_tag());
        self.languages
            .get_mut(&language)
            .ok_or_else(|| format!("LANGUAGE_NOT_FOUND: {language}"))
    }

    pub fn story_script(&self, requested: Option<&str>) -> Result<&str, String> {
        if let Some(language) = self.language(requested) {
            return Ok(&language.script);
        }
        if self.languages.is_empty()
            && requested
                .map(|language| language == self.default_language_tag())
                .unwrap_or(true)
        {
            return Ok(self.global_script.as_deref().unwrap_or(""));
        }
        Err(format!(
            "LANGUAGE_NOT_FOUND: {}",
            requested.unwrap_or_default()
        ))
    }

    pub fn page_text_override(
        &self,
        requested: Option<&str>,
        page_index: usize,
    ) -> Result<PageTextOverride, String> {
        if let Some(language) = self.language(requested) {
            return Ok(language
                .page_text_overrides
                .get(&page_index.to_string())
                .cloned()
                .unwrap_or_default());
        }
        if self.languages.is_empty()
            && requested
                .map(|language| language == self.default_language_tag())
                .unwrap_or(true)
        {
            return Ok(self
                .page_text_overrides
                .as_ref()
                .and_then(|overrides| overrides.get(&page_index.to_string()))
                .cloned()
                .unwrap_or_default());
        }
        Err(format!(
            "LANGUAGE_NOT_FOUND: {}",
            requested.unwrap_or_default()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::{ProjectSchemaVersion, ProjectState, PROJECT_SCHEMA_VERSION};

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
        assert_eq!(state.schema_version, Some(ProjectSchemaVersion::Legacy(2)));
        let serialized = serde_json::to_value(state).unwrap();
        assert_eq!(serialized["page_settings"]["1"]["print_only"], true);
    }

    #[test]
    fn project_v2_exposes_its_legacy_default_language() {
        let source: serde_json::Value =
            serde_json::from_str(include_str!("../../../fixtures/project-v2.json")).unwrap();
        let state: ProjectState = serde_json::from_value(source).unwrap();

        assert_eq!(state.default_language_tag(), "en");
        assert_eq!(
            state.story_script(Some("en")).unwrap(),
            "[Cover]\nContract Fixture\n\n[Author]\nExample Author\n\n[1]\nFirst page"
        );
    }

    #[test]
    fn new_project_uses_the_current_multilingual_contract() {
        let state = ProjectState::default();

        assert_eq!(
            state.schema_version,
            Some(ProjectSchemaVersion::Dated(
                PROJECT_SCHEMA_VERSION.to_string()
            ))
        );
        assert_eq!(state.default_language.as_deref(), Some("zh-CN"));
        assert_eq!(state.languages.len(), 1);
        assert_eq!(state.languages["zh-CN"].script, "");
        assert_eq!(
            state.languages["zh-CN"]
                .publication_metadata
                .as_ref()
                .map(|metadata| metadata.language.as_str()),
            Some("zh-CN")
        );
    }

    #[test]
    fn current_project_round_trips_text_readability_and_width() {
        let mut state = ProjectState::default();
        let language = state.languages.get_mut("zh-CN").unwrap();
        language.inner_text_settings.readability_mode = Some("halo".to_string());
        language.inner_text_settings.readability_strength = Some(65.0);
        language.inner_text_settings.max_width_percent = Some(72.0);
        language.page_text_overrides.insert(
            "1".to_string(),
            super::PageTextOverride {
                text_effects: None,
                offset_x: 24.0,
                offset_y: -18.0,
                text_color: Some("#13283a".to_string()),
                readability_mode: Some("wash".to_string()),
                readability_strength: Some(80.0),
                max_width_percent: Some(48.0),
            },
        );

        let serialized = serde_json::to_value(&state).unwrap();
        let decoded: ProjectState = serde_json::from_value(serialized.clone()).unwrap();

        assert_eq!(
            serialized["languages"]["zh-CN"]["inner_text_settings"]["readability_mode"],
            "halo"
        );
        assert_eq!(
            serialized["languages"]["zh-CN"]["page_text_overrides"]["1"]["max_width_percent"],
            48.0
        );
        let page_override = decoded.page_text_override(Some("zh-CN"), 1).unwrap();
        assert_eq!(page_override.readability_mode.as_deref(), Some("wash"));
        assert_eq!(page_override.readability_strength, Some(80.0));
        assert_eq!(page_override.max_width_percent, Some(48.0));
    }
    #[test]
    fn composite_effects_round_trip_per_language_and_page() {
        let mut state = ProjectState::default();
        let effects = serde_json::json!({"outline": 25, "halo": 45, "backdrop": "wash", "strength": 60,
            "seed": 230, "roughness": 55, "feather": 75, "color": "#ffeedd"});
        state
            .languages
            .get_mut("zh-CN")
            .unwrap()
            .inner_text_settings
            .text_effects = Some(serde_json::from_value(effects.clone()).unwrap());
        let serialized = serde_json::to_value(&state).unwrap();
        let decoded: ProjectState = serde_json::from_value(serialized.clone()).unwrap();
        assert_eq!(
            serialized["languages"]["zh-CN"]["inner_text_settings"]["text_effects"]["seed"],
            230
        );
        assert_eq!(
            decoded.languages["zh-CN"]
                .inner_text_settings
                .text_effects
                .as_ref()
                .unwrap()
                .halo,
            45.0
        );
        let page: super::PageTextOverride = serde_json::from_value(
            serde_json::json!({"offset_x": 0, "offset_y": 0, "text_effects": effects}),
        )
        .unwrap();
        assert_eq!(page.text_effects.unwrap().color.as_deref(), Some("#ffeedd"));
    }
}
