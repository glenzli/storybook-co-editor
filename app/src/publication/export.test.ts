import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectState } from '../project/model';
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
  schema_version: 2,
  project_name: 'Publication',
  last_modified: '2026-09-05T00:00:00Z',
  visible_images: ['same.png', 'same.png', 'same.png'],
  trashed_images: [],
  global_script: '',
  canvas_width: 100,
  canvas_height: 100,
  page_settings: {
    '1': { print_only: true },
  },
  publication_metadata: {
    title: 'Publication',
    language: 'en-US',
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
    mocks.invoke.mockReset().mockResolvedValue({ path: '/tmp/book.scpub', bytes: 1, sha256: '0'.repeat(64) });
    mocks.buildStoryPages.mockReset().mockReturnValue([storyPage(0), storyPage(1), storyPage(2)]);
    mocks.layoutStoryPageText.mockReset().mockReturnValue([]);
    mocks.renderStoryPageArtworkToCanvas.mockReset().mockResolvedValue({
      toBlob: (callback: (blob: Blob) => void) => callback(new Blob([new Uint8Array([1])], { type: 'image/webp' })),
    });
    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }),
    });
    vi.stubGlobal('btoa', () => 'AQ==');
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

    expect(mocks.invoke).toHaveBeenCalledOnce();
    const [command, args] = mocks.invoke.mock.calls[0] as [string, { manifestJson: string }];
    const manifest = JSON.parse(args.manifestJson);

    expect(command).toBe('write_publication_package');
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.pages.map((page: { order: number }) => page.order)).toEqual([0, 1]);
    expect(manifest.pages.map((page: { image: { src: string } }) => page.image.src)).toEqual([
      'pages/0001.webp',
      'pages/0002.webp',
    ]);
    expect(manifest.pages[0].id).not.toBe(manifest.pages[1].id);
    expect(progress.mock.calls).toEqual([
      [{ current: 1, total: 2 }],
      [{ current: 2, total: 2 }],
    ]);
  });
});
