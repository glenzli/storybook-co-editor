export type TextReadabilityMode = 'none' | 'outline' | 'halo' | 'wash' | 'panel';

export interface TextSettings {
  font_size?: number;
  text_color?: string;
  font_family?: string;
  font_weight?: number;
  has_shadow?: boolean;
  has_backdrop?: boolean;
  readability_mode?: TextReadabilityMode;
  readability_strength?: number;
  max_width_percent?: number;
  offset_x?: number;
  offset_y?: number;
  paper_alignment?: 'center' | 'left' | 'top-left';
  auto_snap_content?: boolean;
}

export interface PageTextOverride {
  offset_x: number;
  offset_y: number;
  text_color?: string;
  readability_mode?: TextReadabilityMode;
  readability_strength?: number;
  max_width_percent?: number;
}

export interface SelectiveColor {
  id: string;
  target_hue: number;
  d_hue: number;
  d_sat: number;
  d_lum: number;
  range?: number;
}

export interface ImageAdjustments {
  offset_x?: number;
  offset_y?: number;
  scale?: number;
  bg_color?: string;
  remove_white_bg?: number;
  remove_bg_color?: string;
  brightness?: number;
  exposure?: number;
  highlights?: number;
  shadows?: number;
  contrast?: number;
  saturate?: number;
  temperature?: number;
  tint?: number;
  selective_colors?: SelectiveColor[];
}

export interface PrintSettings {
  paper_size: 'A5' | 'A4' | 'A3';
  paper_orientation: 'portrait' | 'landscape';
  book_size: 'A5' | 'A4';
  layout_mode: '1-up' | '2-up';
  binding_method: 'perfect' | 'saddle' | 'butterfly';
  has_back_cover: boolean;
  spine_mm: number;
  binding_margin_mm: number;
  hardware_margin_mm: number;
  crop_marks: boolean;
  offset_x: number;
  offset_y: number;
  paper_alignment: 'center' | 'left' | 'top-left';
  auto_snap_content: boolean;
  double_sided: boolean;
}

export interface PublicationContributor {
  role: 'author' | 'illustrator' | 'editor' | 'translator' | 'other';
  name: string;
}

export interface PublicationIdentifier {
  scheme: 'ISBN' | 'DOI' | 'URL' | 'CUSTOM';
  value: string;
}

export interface PublicationMetadata {
  version?: number;
  title?: string;
  contributors?: PublicationContributor[];
  language?: string;
  description?: string;
  keywords?: string[];
  publisher?: string;
  publication_date?: string;
  copyright_holder?: string;
  copyright_year?: string;
  copyright_notice?: string;
  license_name?: string;
  license_url?: string;
  identifiers?: PublicationIdentifier[];
  copyright_page_mode?: 'none' | 'electronic' | 'all';
}

export interface ElectronicPdfSettings {
  version?: number;
  preset?: 'screen' | 'personal' | 'open' | 'custom';
  encryption_enabled?: boolean;
  printing?: 'none' | 'low_resolution' | 'high_quality';
  allow_copying?: boolean;
  allow_modification?: boolean;
  allow_annotations?: boolean;
}

export interface PageSettings {
  print_only?: boolean;
}

export interface ProjectLanguage {
  script: string;
  cover_text_settings?: TextSettings;
  title_text_settings?: TextSettings;
  inner_text_settings?: TextSettings;
  author_text_settings?: TextSettings;
  page_text_overrides?: Record<string, PageTextOverride>;
  publication_metadata?: PublicationMetadata;
}

export interface ProjectState {
  schema_version?: number | string;
  project_name: string;
  last_modified: string;
  visible_images: string[];
  trashed_images: string[];
  source_url_map?: Record<string, string>;
  default_language?: string;
  languages?: Record<string, ProjectLanguage>;
  /** v1-v2 project compatibility fields; v3 stores these under languages. */
  global_script?: string;
  cover_text_settings?: TextSettings;
  title_text_settings?: TextSettings;
  inner_text_settings?: TextSettings;
  author_name?: string;
  image_adjustments?: Record<string, ImageAdjustments>;
  print_settings?: PrintSettings;
  canvas_width: number;
  canvas_height: number;
  author_text_settings?: TextSettings;
  page_text_overrides?: Record<string, PageTextOverride>;
  page_settings?: Record<string, PageSettings>;
  publication_metadata?: PublicationMetadata;
  electronic_pdf_settings?: ElectronicPdfSettings;
}

export interface ProjectInfo {
  workspace_id: string;
  state: ProjectState;
}
