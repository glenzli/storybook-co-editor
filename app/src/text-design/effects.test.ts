import { describe, expect, it, vi } from 'vitest';
import { createAdaptiveWashPath, effectsFromMode, getStoryTextReadabilityPaint, normalizeEffects } from './effects';
import { buildStoryPages, layoutStoryPageText } from '../utils/storyPageRenderer';
import type { ProjectState } from '../project/model';

vi.mock('../i18n', () => ({ default: { t: (key: string) => key } }));

describe('adaptive text effects', () => {
  it('keeps legacy paint unchanged while allowing all three treatments together', () => {
    const legacy = getStoryTextReadabilityPaint('wash', '#fff', 30, 55);
    expect(legacy.stroke).toBeNull(); expect(legacy.shadow).toBeNull();
    const combined = getStoryTextReadabilityPaint('none', '#fff', 30, 55,
      { ...effectsFromMode('wash', 55), outline: 30, halo: 45 });
    expect(combined.stroke?.width).toBeGreaterThan(0);
    expect(combined.shadow?.blur).toBeGreaterThan(0);
    expect(combined.backdrop?.kind).toBe('wash');
  });
  it('reproduces a saved shape and responds to seed and line geometry', () => {
    const effects = effectsFromMode('wash', 55);
    const render = (lines: number[], seed = 1) => createAdaptiveWashPath(10, 20, 300, 100, lines, 20, { ...effects, seed });
    expect(render([260, 100])).toBe(render([260, 100]));
    expect(render([260, 100])).not.toBe(render([260, 100], 2));
    expect(render([260, 100])).not.toBe(render([260, 260]));
    expect(render([260, 100])).not.toMatch(/NaN|Infinity/);
  });
  it('bounds persisted and model-directed effect values', () => {
    const result = normalizeEffects({ ...effectsFromMode('halo', 50), halo: Infinity, outline: -90, seed: -3, roughness: 1000, color: 'url(secret)' });
    expect(result.halo).toBe(0); expect(result.outline).toBe(0);
    expect(result.seed).toBe(0); expect(result.roughness).toBe(100); expect(result.color).toBeUndefined();
  });
  it('projects page overrides into resolved publication geometry and all paint layers', () => {
    const state = { visible_images: ['blank://cover', 'blank://body'], canvas_width: 500, canvas_height: 400,
      global_script: '[Cover]\nTitle\n\n[1]\nA longer first line\nShort',
      inner_text_settings: { font_size: 20 },
      page_text_overrides: { '1': { offset_x: 0, offset_y: -20,
        text_effects: { ...effectsFromMode('wash', 65), outline: 25, halo: 35, seed: 19 } } },
    } as unknown as ProjectState;
    const ctx = { save: vi.fn(), restore: vi.fn(), measureText: (text: string) => ({ width: text.length * 10 }) } as unknown as CanvasRenderingContext2D;
    const page = buildStoryPages(state)[1];
    const [layout] = layoutStoryPageText(ctx, page);
    const [again] = layoutStoryPageText(ctx, buildStoryPages(JSON.parse(JSON.stringify(state)))[1]);
    expect(layout).toEqual(again);
    expect(layout.stroke).not.toBeNull(); expect(layout.shadow).not.toBeNull();
    expect(layout.backdrop?.path).toContain('Q');
    expect(layout.lines.map(line => line.text)).toEqual(['A longer first line', 'Short']);
  });
});
