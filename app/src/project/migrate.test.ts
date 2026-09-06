import { describe, expect, it } from 'vitest';
import { migrateProjectState, PROJECT_SCHEMA_VERSION } from './migrate';
import { createProjectLanguage } from './languages';
import fixture from '../../../fixtures/project-v2.json';

describe('migrateProjectState', () => {
  it('moves the v2 contract fixture into its publication language', () => {
    const migrated = migrateProjectState(fixture);

    expect(migrated.schema_version).toBe(PROJECT_SCHEMA_VERSION);
    expect(migrated.default_language).toBe('en');
    expect(migrated.languages?.en.script).toBe(fixture.global_script);
    expect(migrated.languages?.en.cover_text_settings).toEqual(fixture.cover_text_settings);
    expect(migrated.languages?.en.publication_metadata).toEqual({
      ...fixture.publication_metadata,
      language: 'en',
    });
    expect(migrated.global_script).toBeUndefined();
  });

  it('moves the legacy author into the script and discards CMYK configuration', () => {
    const migrated = migrateProjectState({
      project_name: 'Legacy',
      last_modified: '2026-01-01T00:00:00Z',
      visible_images: [],
      trashed_images: [],
      global_script: '[Cover]\nTitle',
      author_name: 'Legacy Author',
      print_settings: { cmyk_convert: true },
      canvas_width: 1024,
      canvas_height: 1024,
    });

    expect(migrated.schema_version).toBe(PROJECT_SCHEMA_VERSION);
    expect(migrated.default_language).toBe('zh-CN');
    expect(migrated.languages?.['zh-CN'].script).toBe('[Author]\nLegacy Author\n\n[Cover]\nTitle');
    expect(migrated.global_script).toBeUndefined();
    expect(migrated.author_name).toBeUndefined();
    expect(migrated.print_settings).not.toHaveProperty('cmyk_convert');
  });

  it('moves an existing v3 language collection to the dated schema version', () => {
    const state = {
      ...fixture,
      schema_version: 3,
      default_language: 'en-US',
      languages: {
        'en-US': createProjectLanguage('en-US', '[Cover]\nMoon'),
      },
    };

    expect(migrateProjectState(state)).toEqual({
      ...state,
      schema_version: PROJECT_SCHEMA_VERSION,
    });
  });

  it('moves the previous dated schema to the text-readability schema', () => {
    const state = {
      ...fixture,
      schema_version: '20260906.01',
      default_language: 'en-US',
      languages: {
        'en-US': createProjectLanguage('en-US', '[Cover]\nMoon'),
      },
    };

    expect(migrateProjectState(state)).toEqual({
      ...state,
      schema_version: PROJECT_SCHEMA_VERSION,
    });
  });
  it('preserves composite effects and upgrades the preceding project schema', () => {
    const effects = { outline: 30, halo: 45, backdrop: 'wash', strength: 55, seed: 231, roughness: 60, feather: 75 };
    const language = { ...createProjectLanguage('en', '[Cover]\nTitle'),
      cover_text_settings: { text_effects: effects } };
    const result = migrateProjectState({ ...fixture, schema_version: '20260906.02', default_language: 'en', languages: { en: language } });
    expect(result.schema_version).toBe(PROJECT_SCHEMA_VERSION);
    expect(result.languages?.en.cover_text_settings?.text_effects).toEqual(effects);
  });

});
