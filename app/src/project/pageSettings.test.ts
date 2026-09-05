import { describe, expect, it } from 'vitest';
import type { ProjectState } from './model';
import {
  getElectronicStoryPageCount,
  isPagePrintOnly,
  setPagePrintOnly,
} from './pageSettings';

function project(pageSettings?: ProjectState['page_settings']): ProjectState {
  return {
    schema_version: 2,
    project_name: 'Pages',
    last_modified: '2026-09-05T00:00:00Z',
    visible_images: ['cover.png', 'blank://old', 'blank://new'],
    trashed_images: [],
    global_script: '',
    canvas_width: 1024,
    canvas_height: 1024,
    page_settings: pageSettings,
  };
}

describe('page output settings', () => {
  it('keeps pages from old projects in electronic output by default', () => {
    const state = project();

    expect(isPagePrintOnly(state, 1)).toBe(false);
    expect(getElectronicStoryPageCount(state)).toBe(3);
  });

  it('adds and removes the print-only property without leaving an empty entry', () => {
    const enabled = setPagePrintOnly(undefined, 2, true);
    const state = project(enabled);

    expect(isPagePrintOnly(state, 2)).toBe(true);
    expect(getElectronicStoryPageCount(state)).toBe(2);
    expect(setPagePrintOnly(enabled, 2, false)).toEqual({});
  });
});
