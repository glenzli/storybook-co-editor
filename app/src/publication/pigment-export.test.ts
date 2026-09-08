import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPublishedTextLayers } from './export';
import { buildStoryPages, layoutStoryPageText } from '../utils/storyPageRenderer';
import { effectsFromMode } from '../text-design/effects';
import type { ProjectState } from '../project/model';

vi.mock('../i18n', () => ({ default: { t: (key: string) => key } }));
afterEach(() => vi.unstubAllGlobals());

describe('frozen publication pigment', () => {
  it('serializes the exact editor paint sequence independently from text and shared artwork', () => {
    const context = { save: vi.fn(), restore: vi.fn(), measureText: (text: string) => ({ width: text.length * 10 }) } as unknown as CanvasRenderingContext2D;
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) });
    const state = { visible_images: ['blank://cover'], canvas_width: 500, canvas_height: 400,
      global_script: '[Cover]\nA longer first line\nShort',
      cover_text_settings: { font_size: 20, text_effects: { ...effectsFromMode('wash', 65), seed: 19, outline: 25, halo: 35 } },
    } as unknown as ProjectState;
    const [page] = buildStoryPages(state);
    const [layout] = layoutStoryPageText(context, page);
    const [published] = JSON.parse(JSON.stringify(buildPublishedTextLayers(page)));
    expect(published.style.backdropPigment).toEqual(layout.backdrop!.pigment!.map(pass => ({ ...pass, strokeWidth: pass.strokeWidth ?? null })));
    expect(published.style.backdropPath).toBe(layout.backdrop!.path);
    expect(published.lines).toEqual(layout.lines);
    expect(published.style.shadow).toEqual(layout.shadow);
    expect(published.style.strokeWidth).toBe(layout.stroke!.width);
    expect(JSON.stringify(published)).not.toContain('seed');
    page.textLayers.forEach(layer => { layer.effects = effectsFromMode('panel', 55); });
    expect(buildPublishedTextLayers(page)[0].style.backdropPigment).toBeNull();
  });
});
