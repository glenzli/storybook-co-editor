import { describe, expect, it } from 'vitest';
import { migrateProjectState } from './migrate';
import fixture from '../../../fixtures/project-v2.json';

describe('migrateProjectState', () => {
  it('preserves the current v2 contract fixture', () => {
    expect(migrateProjectState(fixture)).toEqual(fixture);
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

    expect(migrated.schema_version).toBe(2);
    expect(migrated.global_script).toBe('[Author]\nLegacy Author\n\n[Cover]\nTitle');
    expect(migrated.author_name).toBeUndefined();
    expect(migrated.print_settings).not.toHaveProperty('cmyk_convert');
  });
});
