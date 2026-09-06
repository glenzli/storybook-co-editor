import type { PrintSettings, ProjectState } from './model';
import {
  createProjectLanguage,
  DEFAULT_PROJECT_LANGUAGE,
  normalizeProjectLanguageTag,
} from './languages';

export const PROJECT_SCHEMA_VERSION = '20260906.02';
const PREVIOUS_DATED_SCHEMA_VERSION = '20260906.01';

type LegacyProjectState = Partial<ProjectState> & {
  author_name?: string;
  print_settings?: Partial<PrintSettings> & { cmyk_convert?: unknown };
};

export function migrateProjectState(rawState: unknown): ProjectState {
  if (!rawState || typeof rawState !== 'object') return rawState as ProjectState;
  const state = { ...(rawState as LegacyProjectState) };

  if (typeof state.schema_version !== 'number' && typeof state.schema_version !== 'string') {
    state.schema_version = 1;
  }

  if (state.schema_version === 1) {
    if (state.author_name && state.author_name.trim() !== '') {
      const prefix = `[Author]\n${state.author_name}\n\n`;
      state.global_script = state.global_script ? prefix + state.global_script : prefix.trim();
    }
    delete state.author_name;
    state.schema_version = 2;
  }

  if (state.schema_version === 2) {
    const defaultLanguage = normalizeProjectLanguageTag(state.publication_metadata?.language || '')
      || DEFAULT_PROJECT_LANGUAGE;
    state.default_language = defaultLanguage;
    state.languages = {
      [defaultLanguage]: {
        ...createProjectLanguage(defaultLanguage, state.global_script || ''),
        cover_text_settings: state.cover_text_settings,
        title_text_settings: state.title_text_settings,
        inner_text_settings: state.inner_text_settings,
        author_text_settings: state.author_text_settings,
        page_text_overrides: state.page_text_overrides,
        publication_metadata: state.publication_metadata
          ? { ...state.publication_metadata, language: defaultLanguage }
          : { version: 1, language: defaultLanguage },
      },
    };
    delete state.global_script;
    delete state.cover_text_settings;
    delete state.title_text_settings;
    delete state.inner_text_settings;
    delete state.author_text_settings;
    delete state.page_text_overrides;
    delete state.publication_metadata;
    state.schema_version = PROJECT_SCHEMA_VERSION;
  }

  if (state.schema_version === 3) {
    state.schema_version = PROJECT_SCHEMA_VERSION;
  }

  if (state.schema_version === PREVIOUS_DATED_SCHEMA_VERSION) {
    state.schema_version = PROJECT_SCHEMA_VERSION;
  }

  if (state.schema_version === PROJECT_SCHEMA_VERSION && (!state.languages || Object.keys(state.languages).length === 0)) {
    const defaultLanguage = normalizeProjectLanguageTag(state.default_language || '')
      || DEFAULT_PROJECT_LANGUAGE;
    state.default_language = defaultLanguage;
    state.languages = { [defaultLanguage]: createProjectLanguage(defaultLanguage) };
  }

  if (state.print_settings && typeof state.print_settings === 'object') {
    delete state.print_settings.cmyk_convert;
  }

  return state as ProjectState;
}
