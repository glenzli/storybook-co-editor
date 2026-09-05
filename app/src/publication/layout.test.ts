import { describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({ default: { t: (key: string) => key } }));

import {
  layoutStoryPageText,
  type StoryPage,
} from '../utils/storyPageRenderer';

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
        fontSize: 20,
        color: '#ffffff',
        hasShadow: true,
        hasBackdrop: true,
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
    expect(layout.lineHeight).toBe(30);
    expect(layout.stroke).toEqual({ color: 'rgba(0,0,0,0.8)', width: 1.6, lineJoin: 'round' });
    expect(layout.backdrop).toEqual({
      color: 'rgba(0,0,0,0.35)',
      x: 45,
      y: 3.5,
      width: 120,
      height: 68,
      radius: 6,
    });
  });
});
