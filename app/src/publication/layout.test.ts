import { describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({ default: { t: (key: string) => key } }));

import {
  buildStoryPages,
  getStoryTextReadabilityPaint,
  layoutStoryPageText,
  type StoryPage,
} from '../utils/storyPageRenderer';
import type { ProjectState } from '../project/model';

describe('publication text layout', () => {
  it('freezes wrapped lines in final canvas coordinates', () => {
    const context = {
      font: '',
      save: vi.fn(),
      restore: vi.fn(),
      measureText: (text: string) => ({ width: text.length * 10 }),
    } as unknown as CanvasRenderingContext2D;
    const page: StoryPage = {
      index: 0,
      role: 'cover',
      width: 200,
      height: 100,
      image: {
        source: 'blank://fixture',
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
      textLayers: [{
        id: 'main',
        text: 'abcdefghijk',
        fontFamily: 'serif',
        fontWeight: 300,
        fontSize: 20,
        color: '#ffffff',
        readabilityMode: 'panel',
        readabilityStrength: 55,
        maxWidthPercent: 52,
        offsetX: 5,
        offsetY: 0,
      }],
    };

    const [layout] = layoutStoryPageText(context, page);

    expect(layout.sourceText).toBe('abcdefghijk');
    expect(layout.lines).toEqual([
      { text: 'abcdefghij', x: 105, y: 30 },
      { text: 'k', x: 105, y: 60 },
    ]);
    expect(layout.fontSize).toBe(20);
    expect(layout.fontWeight).toBe(300);
    expect(context.font).toContain('300 20px');
    expect(layout.lineHeight).toBe(30);
    expect(layout.maxWidth).toBe(104);
    expect(layout.stroke).toBeNull();
    expect(layout.shadow).toBeNull();
    expect(layout.backdrop).toEqual({
      kind: 'panel',
      color: 'rgba(0,0,0,0.351)',
      x: 45,
      y: 3.5,
      width: 120,
      height: 68,
      paddingX: 10,
      paddingY: 4,
      radius: 6,
      feather: 0,
      path: null,
    });
  });

  it('resolves legacy readability and per-page width without changing old project files', () => {
    const project: ProjectState = {
      schema_version: '20260906.01',
      project_name: 'Fixture',
      last_modified: '2026-09-06T00:00:00Z',
      visible_images: ['cover.png', 'page.png'],
      trashed_images: [],
      global_script: '[Cover]\nTitle\n\n[1]\nA quiet line',
      canvas_width: 1000,
      canvas_height: 1000,
      cover_text_settings: { has_shadow: true },
      inner_text_settings: { has_shadow: false },
      page_text_overrides: {
        '1': {
          offset_x: 0,
          offset_y: 0,
          readability_mode: 'wash',
          readability_strength: 70,
          max_width_percent: 48,
        },
      },
    };

    const pages = buildStoryPages(project);

    expect(pages[0].textLayers[0].readabilityMode).toBe('outline');
    expect(pages[0].textLayers[0].fontWeight).toBe(400);
    expect(pages[1].textLayers[0]).toMatchObject({
      readabilityMode: 'wash',
      readabilityStrength: 70,
      maxWidthPercent: 48,
    });
  });

  it('uses a soft halo without adding a hard stroke or backdrop', () => {
    const paint = getStoryTextReadabilityPaint('halo', '#ffffff', 40, 60);

    expect(paint.stroke).toBeNull();
    expect(paint.backdrop).toBeNull();
    expect(paint.shadow?.blur).toBeGreaterThan(6);
    expect(paint.shadow?.spread).toBeGreaterThan(1);
  });
});
