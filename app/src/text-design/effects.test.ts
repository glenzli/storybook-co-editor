import { describe, expect, it, vi } from 'vitest';
import { createAdaptiveWashPath, effectsFromMode, getStoryTextReadabilityPaint, normalizeEffects } from './effects';
import { buildStoryPages, layoutStoryPageText } from '../utils/storyPageRenderer';
import type { ProjectState, TextEffects } from '../project/model';

vi.mock('../i18n', () => ({ default: { t: (key: string) => key } }));

// Sample the actual quadratic contour, then probe the text's protected reading area.
function contains(path: string, x: number, y: number): boolean {
  const values = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const points: number[][] = [values.slice(0, 2)];
  for (let i = 2; i < values.length; i += 4) {
    const [ax, ay] = points[points.length - 1];
    const [bx, by, cx, cy] = values.slice(i, i + 4);
    for (let step = 1; step <= 8; step++) {
      const t = step / 8, s = 1 - t;
      points.push([s * s * ax + 2 * s * t * bx + t * t * cx,
        s * s * ay + 2 * s * t * by + t * t * cy]);
    }
  }
  let inside = false;
  points.forEach(([ax, ay], i) => {
    const [bx, by] = points[(i + 1) % points.length];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  });
  return inside;
}

describe('adaptive text effects', () => {
  it('allows all three treatments together without adding a text stroke to wash', () => {
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
  it.each([[260], [260, 20, 260, 30], [20, 260, 0, 40, 120, 260]])(
    'covers long lines and keeps a broad body through short and empty lines: %j', (...widths) => {
      const height = widths.length * 45;
      for (const seed of [0, 1, 33, 4294967295]) {
        const path = createAdaptiveWashPath(10, 20, 300, height, widths, 20,
          { ...effectsFromMode('wash', 55), seed, roughness: 100 });
        widths.forEach((width, row) => {
          for (const dy of [-10, 0, 10]) {
            const y = 20 + (row + 0.5) * 45 + dy;
            expect(contains(path, 160 - width / 2 - 4, y)).toBe(true);
            expect(contains(path, 160 + width / 2 + 4, y)).toBe(true);
            expect(contains(path, 160 - 100, y)).toBe(true);
            expect(contains(path, 160 + 100, y)).toBe(true);
          }
        });
      }
    },
  );
  it('uses the same wash for old presets and saved effects without rewriting the project', () => {
    const state = { visible_images: ['blank://cover'], canvas_width: 500, canvas_height: 400,
      global_script: '[Cover]\nA long line\nShort', cover_text_settings: {
        font_size: 20, readability_mode: 'wash', readability_strength: 55,
      },
    } as unknown as ProjectState;
    const original = JSON.stringify(state);
    const ctx = { save: vi.fn(), restore: vi.fn(), measureText: (text: string) => ({ width: text.length * 10 }) } as unknown as CanvasRenderingContext2D;
    const page = buildStoryPages(state)[0];
    const [legacy] = layoutStoryPageText(ctx, page);
    const [explicit] = layoutStoryPageText(ctx, { ...page, textLayers: page.textLayers.map(layer =>
      ({ ...layer, effects: effectsFromMode('wash', 55) })) });
    expect(legacy).toEqual(explicit);
    expect(legacy.backdrop!.pigment!.length).toBeGreaterThan(0);
    expect(JSON.stringify(state)).toBe(original);
  });
  it('preserves custom wash tint and makes strength control the readable body', () => {
    const paint = (strength: number, extra: Partial<TextEffects> = {}) =>
      getStoryTextReadabilityPaint('wash', '#000', 30, strength,
        { ...effectsFromMode('wash', strength), ...extra }).backdrop!;
    const alpha = (color: string) => Number(color.split(',').slice(-1)[0].replace(')', ''));
    expect(alpha(paint(55).color)).toBeGreaterThan(0.7);
    expect(alpha(paint(100).color)).toBeGreaterThan(alpha(paint(20).color));
    expect(paint(55, { color: '#aabbcc' }).color).toBe('rgba(170,187,204,0.747)');
    expect(paint(55, { feather: 100 }).feather).toBeGreaterThan(paint(55, { feather: 0 }).feather);
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
