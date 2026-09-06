import { describe, expect, it, vi } from 'vitest';
import { candidatePatch, fitsPage, refinedLayer } from './candidates';
import { effectsFromMode } from './effects';
import { buildStoryPages } from '../utils/storyPageRenderer';
import { ProjectHistory } from '../project/history';
import type { ProjectState } from '../project/model';
vi.mock('../i18n', () => ({ default: { t: (key: string) => key } }));
const state = { visible_images: ['blank://cover', 'blank://body'], canvas_width: 500, canvas_height: 400,
  global_script: '[Cover]\nTitle\n\n[1]\nShort', inner_text_settings: { font_size: 20 },
  page_text_overrides: { '2': { offset_x: 20, offset_y: -40 } },
} as unknown as ProjectState;
const ctx = { save: vi.fn(), restore: vi.fn(), measureText: (text: string) => ({ width: text.length * 10 }) } as unknown as CanvasRenderingContext2D;

describe('text candidate boundaries', () => {
  it('rejects clipping and collisions with an existing author layer', () => {
    const page = buildStoryPages(state)[1], layer = page.textLayers[0];
    expect(fitsPage(ctx, page, layer)).toBe(true);
    expect(fitsPage(ctx, page, { ...layer, offsetX: 900 })).toBe(false);
    expect(fitsPage(ctx, { ...page, textLayers: [layer, { ...layer, id: 'author' }] }, layer)).toBe(false);
  });
  it('refines only bounded treatment values, preserving text and layout', () => {
    const layer = { ...buildStoryPages(state)[1].textLayers[0], effects: effectsFromMode('wash', 95) };
    const refined = refinedLayer(layer, 'stronger_backdrop');
    expect(refined.effects?.strength).toBe(100);
    expect(refined.text).toBe(layer.text); expect(refined.offsetX).toBe(layer.offsetX);
    expect(refined.fontSize).toBe(layer.fontSize); expect(layer.effects.strength).toBe(95);
  });
  it('applies one page atomically and restores it with undo', () => {
    const page = buildStoryPages(state)[1];
    const layer = { ...page.textLayers[0], effects: effectsFromMode('wash', 60), offsetX: 15 };
    const history = new ProjectHistory<ProjectState>(structuredClone); history.reset(state);
    const next = { ...state, ...candidatePatch(state, page, layer) }; history.push(next);
    expect(next.page_text_overrides?.['2']).toEqual(state.page_text_overrides?.['2']);
    expect(next.inner_text_settings).toEqual(state.inner_text_settings);
    expect(next.page_text_overrides?.['1'].text_effects?.strength).toBe(60);
    expect(history.undo()).toEqual(state);
  });
});
