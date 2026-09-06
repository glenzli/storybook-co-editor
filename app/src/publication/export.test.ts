import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectState } from '../project/model';
import { PROJECT_SCHEMA_VERSION } from '../project/migrate';
import type { StoryPage } from '../utils/storyPageRenderer';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  buildStoryPages: vi.fn(),
  layoutStoryPageText: vi.fn(),
  renderStoryPageArtworkToCanvas: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('../utils/storyPageRenderer', () => ({
  buildStoryPages: mocks.buildStoryPages,
  layoutStoryPageText: mocks.layoutStoryPageText,
  renderStoryPageArtworkToCanvas: mocks.renderStoryPageArtworkToCanvas,
}));

import { exportWebPublication } from './export';

const projectState: ProjectState = {
  schema_version: PROJECT_SCHEMA_VERSION,
  project_name: 'Publication',
  last_modified: '2026-09-05T00:00:00Z',
  visible_images: ['same.png', 'same.png', 'same.png'],
  trashed_images: [],
  default_language: 'zh-CN',
  languages: {
    'zh-CN': {
      script: '[Cover]\n出版物',
      publication_metadata: { title: '出版物', language: 'zh-CN' },
    },
    'en-US': {
      script: '[Cover]\nPublication',
      publication_metadata: { title: 'Publication', language: 'en-US' },
    },
  },
  canvas_width: 100,
  canvas_height: 100,
  page_settings: {
    '1': { print_only: true },
  },
};

function storyPage(index: number): StoryPage {
  return {
    index,
    role: index === 0 ? 'cover' : 'body',
    width: 100,
    height: 100,
    image: {
      source: 'same.png',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      backgroundColor: '#ffffff',
      adjustments: {
        brightness: 0,
        exposure: 0,
        highlights: 0,
        shadows: 0,
        contrast: 0,
        saturate: 0,
        temperature: 0,
        tint: 0,
        selective_colors: [],
        remove_white_bg: 0,
      },
    },
    textLayers: [],
  };
}

describe('web publication export', () => {
  beforeEach(() => {
    mocks.invoke.mockReset().mockImplementation((command: string) => {
      if (command === 'encode_publication_webp') return Promise.resolve('AQ==');
      if (command === 'write_publication_package') {
        return Promise.resolve({ path: '/tmp/book.scpub', bytes: 1, sha256: '0'.repeat(64) });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    mocks.buildStoryPages.mockReset().mockReturnValue([storyPage(0), storyPage(1), storyPage(2)]);
    mocks.layoutStoryPageText.mockReset().mockReturnValue([]);
    mocks.renderStoryPageArtworkToCanvas.mockReset().mockResolvedValue({
      toBlob: (callback: (blob: Blob) => void) => callback(new Blob([new Uint8Array([1])], { type: 'image/png' })),
    });
    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }),
    });
    vi.stubGlobal('btoa', () => 'AQ==');
    vi.stubGlobal('atob', () => String.fromCharCode(1));
  });

  it('omits print-only pages and writes contiguous output order and paths', async () => {
    const progress = vi.fn();

    await exportWebPublication({
      projectState,
      imageSources: projectState.visible_images,
      targetPath: '/tmp/book.scpub',
      createdAt: '2026-09-05T00:00:00Z',
      onProgress: progress,
    });

    expect(mocks.invoke.mock.calls.map(([command]) => command)).toEqual([
      'encode_publication_webp',
      'encode_publication_webp',
      'write_publication_package',
    ]);
    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'encode_publication_webp', {
      pngBase64: 'AQ==',
    });
    const [command, args] = mocks.invoke.mock.calls[2] as [string, { manifestJson: string }];
    const manifest = JSON.parse(args.manifestJson);

    expect(command).toBe('write_publication_package');
    expect(manifest.formatVersion).toBe('20260906.01');
    expect(manifest.defaultLanguage).toBe('zh-CN');
    expect(manifest.languages.map((language: { language: string }) => language.language)).toEqual([
      'zh-CN',
      'en-US',
    ]);
    expect(manifest.pages.map((page: { order: number }) => page.order)).toEqual([0, 1]);
    expect(manifest.pages.map((page: { image: { src: string } }) => page.image.src)).toEqual([
      'pages/0001.webp',
      'pages/0002.webp',
    ]);
    expect(manifest.pages[0].id).not.toBe(manifest.pages[1].id);
    expect(manifest.pages[0]).not.toHaveProperty('textLayers');
    expect(manifest.languages.every((language: { pages: unknown[] }) => language.pages.length === 2)).toBe(true);
    expect(mocks.buildStoryPages.mock.calls.map(([state]) => state.global_script)).toEqual([
      '[Cover]\n出版物',
      '[Cover]\n出版物',
      '[Cover]\nPublication',
    ]);
    expect(progress.mock.calls).toEqual([
      [{ current: 1, total: 2 }],
      [{ current: 2, total: 2 }],
    ]);
  });
});
