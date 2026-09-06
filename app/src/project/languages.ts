import type { ProjectLanguage, ProjectState } from './model';

export type ProjectLanguageSeed = Pick<ProjectLanguage, 'script' | 'publication_metadata'>;

export const DEFAULT_PROJECT_LANGUAGE = 'zh-CN';

const LANGUAGE_STATE_KEYS = [
  'global_script',
  'cover_text_settings',
  'title_text_settings',
  'inner_text_settings',
  'author_text_settings',
  'page_text_overrides',
  'publication_metadata',
] as const;

export function normalizeProjectLanguageTag(value: string): string | null {
  const candidate = value.trim().replace(/_/g, '-');
  if (!candidate) return null;
  try {
    return Intl.getCanonicalLocales(candidate)[0] || null;
  } catch {
    return null;
  }
}

export function createProjectLanguage(language: string, script = ''): ProjectLanguage {
  return {
    script,
    cover_text_settings: { font_size: 40 },
    title_text_settings: { font_size: 32 },
    inner_text_settings: {},
    author_text_settings: { font_size: 16 },
    page_text_overrides: {},
    publication_metadata: { version: 1, language },
  };
}

function legacyProjectLanguage(projectState: ProjectState): ProjectLanguage {
  return {
    script: projectState.global_script || '',
    cover_text_settings: projectState.cover_text_settings,
    title_text_settings: projectState.title_text_settings,
    inner_text_settings: projectState.inner_text_settings,
    author_text_settings: projectState.author_text_settings,
    page_text_overrides: projectState.page_text_overrides,
    publication_metadata: projectState.publication_metadata,
  };
}

export function getProjectLanguageTags(projectState: ProjectState): string[] {
  const tags = Object.keys(projectState.languages || {}).sort();
  if (tags.length === 0) {
    return [projectState.default_language || projectState.publication_metadata?.language || DEFAULT_PROJECT_LANGUAGE];
  }
  const defaultLanguage = projectState.default_language;
  return defaultLanguage && tags.includes(defaultLanguage)
    ? [defaultLanguage, ...tags.filter(tag => tag !== defaultLanguage)]
    : tags;
}

export function getDefaultProjectLanguage(projectState: ProjectState): string {
  const tags = getProjectLanguageTags(projectState);
  return tags.includes(projectState.default_language || '')
    ? projectState.default_language!
    : tags[0];
}

export function getProjectLanguage(projectState: ProjectState, language?: string): ProjectLanguage {
  const selectedLanguage = language || getDefaultProjectLanguage(projectState);
  return projectState.languages?.[selectedLanguage]
    || projectState.languages?.[getDefaultProjectLanguage(projectState)]
    || legacyProjectLanguage(projectState);
}

export function resolveProjectLanguageState(projectState: ProjectState, language?: string): ProjectState {
  const selectedLanguage = language && projectState.languages?.[language]
    ? language
    : getDefaultProjectLanguage(projectState);
  const content = getProjectLanguage(projectState, selectedLanguage);
  const publicationMetadata = content.publication_metadata
    ? { ...content.publication_metadata, language: selectedLanguage }
    : { version: 1, language: selectedLanguage };

  return {
    ...projectState,
    global_script: content.script,
    cover_text_settings: content.cover_text_settings,
    title_text_settings: content.title_text_settings,
    inner_text_settings: content.inner_text_settings,
    author_text_settings: content.author_text_settings,
    page_text_overrides: content.page_text_overrides,
    publication_metadata: publicationMetadata,
  };
}

export function updateProjectLanguage(
  projectState: ProjectState,
  language: string,
  updates: Partial<ProjectLanguage>,
): Pick<ProjectState, 'languages'> {
  const current = getProjectLanguage(projectState, language);
  const next: ProjectLanguage = { ...current, ...updates };
  if ('publication_metadata' in updates) {
    next.publication_metadata = updates.publication_metadata
      ? { ...updates.publication_metadata, language }
      : undefined;
  }
  return {
    languages: {
      ...(projectState.languages || {}),
      [language]: next,
    },
  };
}

export function routeProjectLanguageUpdates(
  projectState: ProjectState,
  language: string,
  updates: Partial<ProjectState>,
): Partial<ProjectState> {
  const sharedUpdates = { ...updates };
  const languageUpdates: Partial<ProjectLanguage> = {};

  for (const key of LANGUAGE_STATE_KEYS) {
    if (!(key in updates)) continue;
    if (key === 'global_script') {
      languageUpdates.script = updates.global_script || '';
    } else {
      const languageKey = key as Exclude<typeof key, 'global_script'>;
      Object.assign(languageUpdates, { [languageKey]: updates[languageKey] });
    }
    delete sharedUpdates[key];
  }

  return {
    ...sharedUpdates,
    ...(Object.keys(languageUpdates).length > 0
      ? updateProjectLanguage(projectState, language, languageUpdates)
      : {}),
  };
}

export function addProjectLanguage(
  projectState: ProjectState,
  language: string,
  seed?: ProjectLanguageSeed,
): Partial<ProjectState> {
  if (projectState.languages?.[language]) return {};
  const defaultLanguage = getDefaultProjectLanguage(projectState);
  const existingLanguages = projectState.languages || {
    [defaultLanguage]: getProjectLanguage(projectState, defaultLanguage),
  };
  const nextLanguage = createProjectLanguage(language, seed?.script);
  if (seed?.publication_metadata) {
    nextLanguage.publication_metadata = {
      ...seed.publication_metadata,
      contributors: seed.publication_metadata.contributors?.map(contributor => ({ ...contributor })),
      keywords: seed.publication_metadata.keywords ? [...seed.publication_metadata.keywords] : undefined,
      identifiers: seed.publication_metadata.identifiers?.map(identifier => ({ ...identifier })),
      language,
    };
  }
  return {
    default_language: projectState.default_language || defaultLanguage,
    languages: {
      ...existingLanguages,
      [language]: nextLanguage,
    },
  };
}

export function removeProjectLanguage(projectState: ProjectState, language: string): Partial<ProjectState> {
  const languages = { ...(projectState.languages || {}) };
  delete languages[language];
  const remaining = Object.keys(languages);
  if (remaining.length === 0) return {};
  return {
    languages,
    default_language: projectState.default_language === language
      ? remaining[0]
      : projectState.default_language,
  };
}
