import { describe, expect, it } from 'vitest';
import type { ProjectState } from './model';
import {
  addProjectLanguage,
  getProjectLanguage,
  normalizeProjectLanguageTag,
  resolveProjectLanguageState,
  routeProjectLanguageUpdates,
} from './languages';
import { PROJECT_SCHEMA_VERSION } from './migrate';

const projectState: ProjectState = {
  schema_version: PROJECT_SCHEMA_VERSION,
  project_name: 'Languages',
  last_modified: '2026-09-06T00:00:00Z',
  visible_images: ['cover.png'],
  trashed_images: [],
  canvas_width: 1024,
  canvas_height: 1024,
  default_language: 'zh-CN',
  languages: {
    'zh-CN': {
      script: '[Cover]\n月亮',
      inner_text_settings: { font_size: 20 },
      page_text_overrides: { '0': { offset_x: 1, offset_y: 2 } },
      publication_metadata: { title: '月亮', language: 'zh-CN' },
    },
  },
};

describe('project content languages', () => {
  it('normalizes BCP 47 language tags', () => {
    expect(normalizeProjectLanguageTag('en_us')).toBe('en-US');
    expect(normalizeProjectLanguageTag('not a language')).toBeNull();
  });

  it('adds an independent language', () => {
    const patch = addProjectLanguage(projectState, 'en-US');
    const updated = { ...projectState, ...patch };

    expect(getProjectLanguage(updated, 'zh-CN').script).toBe('[Cover]\n月亮');
    expect(getProjectLanguage(updated, 'en-US').script).toBe('');
    expect(getProjectLanguage(updated, 'en-US').page_text_overrides).toEqual({});
  });

  it('seeds a translated script and publication information without copying layout overrides', () => {
    const patch = addProjectLanguage(projectState, 'en-US', {
      script: '[Cover]\nThe Moon',
      publication_metadata: {
        title: 'The Moon',
        contributors: [{ role: 'author', name: 'Glen Li' }],
        language: 'zh-CN',
        identifiers: [{ scheme: 'DOI', value: '10.5281/example' }],
      },
    });
    const updated = { ...projectState, ...patch };
    const english = getProjectLanguage(updated, 'en-US');

    expect(english.script).toBe('[Cover]\nThe Moon');
    expect(english.publication_metadata).toEqual({
      title: 'The Moon',
      contributors: [{ role: 'author', name: 'Glen Li' }],
      language: 'en-US',
      identifiers: [{ scheme: 'DOI', value: '10.5281/example' }],
    });
    expect(english.page_text_overrides).toEqual({});
    expect(getProjectLanguage(updated, 'zh-CN').publication_metadata?.title).toBe('月亮');
  });

  it('routes text changes only to the active language', () => {
    const withEnglish = { ...projectState, ...addProjectLanguage(projectState, 'en-US') };
    const patch = routeProjectLanguageUpdates(withEnglish, 'en-US', {
      global_script: '[Cover]\nThe Moon',
      inner_text_settings: { font_size: 18 },
    });
    const updated = { ...withEnglish, ...patch };

    expect(getProjectLanguage(updated, 'zh-CN').script).toBe('[Cover]\n月亮');
    expect(getProjectLanguage(updated, 'zh-CN').inner_text_settings?.font_size).toBe(20);
    expect(resolveProjectLanguageState(updated, 'en-US').global_script).toBe('[Cover]\nThe Moon');
    expect(resolveProjectLanguageState(updated, 'en-US').publication_metadata?.language).toBe('en-US');
  });
});
