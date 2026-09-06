import { describe, expect, it } from 'vitest';
import type { ProjectState } from '../project/model';
import { PROJECT_SCHEMA_VERSION } from '../project/migrate';
import {
  createMoveMapping,
  remapMovedIndex,
  remapPageIndexedState,
} from './pageCollection';

const projectState: ProjectState = {
  schema_version: PROJECT_SCHEMA_VERSION,
  project_name: 'Pages',
  last_modified: '2026-07-31T00:00:00Z',
  visible_images: ['a.png', 'b.png', 'c.png'],
  trashed_images: [],
  default_language: 'zh-CN',
  languages: {
    'zh-CN': {
      script: '',
      page_text_overrides: {
        '0': { offset_x: 1, offset_y: 1 },
        '2': { offset_x: 3, offset_y: 3 },
      },
    },
    'en-US': {
      script: '',
      page_text_overrides: {
        '1': { offset_x: 2, offset_y: 2 },
      },
    },
  },
  canvas_width: 1024,
  canvas_height: 1024,
  image_adjustments: {
    '0': { brightness: 1 },
    '1': { brightness: 2 },
    '2': { brightness: 3 },
  },
  page_settings: {
    '1': { print_only: true },
  },
};

describe('page collection indexing', () => {
  it('uses one mapping for selection and page-owned dictionaries', () => {
    const mapping = createMoveMapping(2, 0);
    expect([0, 1, 2].map(mapping)).toEqual([1, 2, 0]);
    expect(remapMovedIndex(1, 2, 0)).toBe(2);
    expect(remapPageIndexedState(projectState, 3, mapping)).toEqual({
      image_adjustments: {
        '0': { brightness: 3 },
        '1': { brightness: 1 },
        '2': { brightness: 2 },
      },
      languages: {
        'zh-CN': {
          script: '',
          page_text_overrides: {
            '0': { offset_x: 3, offset_y: 3 },
            '1': { offset_x: 1, offset_y: 1 },
          },
        },
        'en-US': {
          script: '',
          page_text_overrides: {
            '2': { offset_x: 2, offset_y: 2 },
          },
        },
      },
      page_settings: {
        '2': { print_only: true },
      },
    });
  });

  it('drops page-owned data when a page is removed', () => {
    const result = remapPageIndexedState(projectState, 3, index => {
      if (index === 1) return null;
      return index > 1 ? index - 1 : index;
    });
    expect(result.image_adjustments).toEqual({
      '0': { brightness: 1 },
      '1': { brightness: 3 },
    });
    expect(result.page_settings).toEqual({});
    expect(result.languages?.['zh-CN'].page_text_overrides).toEqual({
      '0': { offset_x: 1, offset_y: 1 },
      '1': { offset_x: 3, offset_y: 3 },
    });
    expect(result.languages?.['en-US'].page_text_overrides).toEqual({});
  });
});
