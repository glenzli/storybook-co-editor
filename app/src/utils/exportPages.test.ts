import { describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  default: {
    t: (key: string) => key,
    getFixedT: () => (key: string) => key,
  },
  getPublicationLanguage: () => 'en-US',
}));

import type { ProjectState } from '../project/model';
import { buildExportPages } from './exportPages';

const projectState: ProjectState = {
  schema_version: 2,
  project_name: 'Output pages',
  last_modified: '2026-09-05T00:00:00Z',
  visible_images: ['cover.png', 'blank://print', 'page-2.png'],
  trashed_images: [],
  global_script: '[Cover]\nCover\n\n[1]\nPrint blank\n\n[2]\nElectronic page',
  canvas_width: 1024,
  canvas_height: 1024,
  page_settings: {
    '1': { print_only: true },
  },
};

describe('export page selection', () => {
  it('skips print-only pages electronically without changing source indexes', () => {
    const pages = buildExportPages(projectState, projectState.visible_images, 'electronic');
    const stories = pages.filter(page => page.kind === 'story');

    expect(stories.map(page => page.story.index)).toEqual([0, 2]);
    expect(stories[1].story.textLayers[0].text).toBe('Electronic page');
    expect(pages.map(page => page.exportIndex)).toEqual([0, 1]);
  });

  it('keeps print-only pages in print output', () => {
    const pages = buildExportPages(projectState, projectState.visible_images, 'print');

    expect(pages.filter(page => page.kind === 'story').map(page => page.story.index)).toEqual([0, 1, 2]);
  });
});
