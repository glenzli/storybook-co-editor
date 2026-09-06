import type { PageTextOverride, ProjectState, TextEffects } from '../project/model';
import { drawStoryPageText, layoutStoryPageText, renderStoryPageArtworkToCanvas,
  type StoryPage, type StoryTextLayer } from '../utils/storyPageRenderer';
import { getFontFamilyStack } from '../utils/fonts';
import { effectsFromMode, normalizeEffects } from './effects';

export interface TextCandidate {
  id: string;
  layer: StoryTextLayer;
  score: number;
  preview: string;
  detail: string;
  original?: boolean;
}
export type Refinement = 'none' | 'stronger_halo' | 'lighter_outline' | 'stronger_backdrop' | 'lighter_backdrop' | 'softer_wash';
export interface DesignReview { preferred: string[]; notes: string; refinement: Refinement; target: string }

function bounds(ctx: CanvasRenderingContext2D, page: StoryPage, layer: StoryTextLayer) {
  const [layout] = layoutStoryPageText(ctx, { ...page, textLayers: [layer] });
  ctx.font = `${layout.fontWeight} ${layout.fontSize}px ${layout.fontFamilyStack}`;
  const width = Math.max(...layout.lines.map(line => ctx.measureText(line.text).width));
  const effectPad = Math.max(layout.stroke?.width || 0, (layout.shadow?.blur || 0) * 2,
    (layout.backdrop?.paddingX || 0) + (layout.backdrop?.feather || 0) * 2);
  return { layout, x: layout.lines[0].x - width / 2 - effectPad,
    y: layout.lines[0].y - layout.lineHeight - effectPad,
    width: width + effectPad * 2, height: layout.lines.length * layout.lineHeight + effectPad * 2 };
}

export function fitsPage(ctx: CanvasRenderingContext2D, page: StoryPage, layer: StoryTextLayer): boolean {
  const box = bounds(ctx, page, layer), margin = Math.max(8, page.width * 0.025);
  if (box.x < margin || box.y < margin || box.x + box.width > page.width - margin || box.y + box.height > page.height - margin) return false;
  return page.textLayers.filter(other => other.id !== layer.id).every(other => {
    const b = bounds(ctx, page, other);
    return box.x + box.width < b.x || b.x + b.width < box.x || box.y + box.height < b.y || b.y + b.height < box.y;
  });
}

function sampleRegion(ctx: CanvasRenderingContext2D, page: StoryPage, layer: StoryTextLayer, pixels: ImageData) {
  const box = bounds(ctx, page, layer);
  const sx = pixels.width / page.width, sy = pixels.height / page.height;
  let sum = 0, edge = 0, dark = 0, count = 0, r = 0, g = 0, b = 0;
  for (let y = Math.max(0, Math.floor(box.y * sy)); y < Math.min(pixels.height - 1, (box.y + box.height) * sy); y += 2) {
    for (let x = Math.max(0, Math.floor(box.x * sx)); x < Math.min(pixels.width - 1, (box.x + box.width) * sx); x += 2) {
      const i = (y * pixels.width + x) * 4;
      const lum = (pixels.data[i] * .2126 + pixels.data[i + 1] * .7152 + pixels.data[i + 2] * .0722) / 255;
      const next = (pixels.data[i + 4] * .2126 + pixels.data[i + 5] * .7152 + pixels.data[i + 6] * .0722) / 255;
      sum += lum; edge += Math.abs(lum - next); dark += lum < .45 ? 1 : 0;
      r += pixels.data[i]; g += pixels.data[i + 1]; b += pixels.data[i + 2]; count++;
    }
  }
  count = Math.max(1, count);
  return { mean: sum / count, edge: edge / count, dark: dark / count, rgb: [r / count, g / count, b / count] };
}

export function refinedLayer(layer: StoryTextLayer, action: Refinement): StoryTextLayer {
  const e = normalizeEffects(layer.effects || effectsFromMode(layer.readabilityMode, layer.readabilityStrength));
  if (action === 'stronger_halo') e.halo = Math.min(100, Math.max(25, e.halo + 20));
  if (action === 'lighter_outline') e.outline = Math.max(0, e.outline - 20);
  if (action === 'stronger_backdrop') { if (e.backdrop === 'none') e.backdrop = 'wash'; e.strength = Math.min(100, e.strength + 20); }
  if (action === 'lighter_backdrop') e.strength = Math.max(20, e.strength - 20);
  if (action === 'softer_wash') { e.backdrop = 'wash'; e.feather = Math.min(100, e.feather + 20); }
  return { ...layer, effects: e };
}

export function candidatePatch(state: ProjectState, page: StoryPage, layer: StoryTextLayer): Partial<ProjectState> {
  const patch: PageTextOverride = { offset_x: layer.offsetX, offset_y: layer.offsetY,
    text_color: layer.color, max_width_percent: layer.maxWidthPercent,
    readability_mode: layer.readabilityMode, readability_strength: layer.readabilityStrength, text_effects: layer.effects };
  if (page.role === 'cover') return { cover_text_settings: { ...state.cover_text_settings, ...patch } };
  if (page.role === 'title') return { title_text_settings: { ...state.title_text_settings, ...patch } };
  return { page_text_overrides: { ...state.page_text_overrides, [String(page.index)]: patch } };
}

export async function prepareArtwork(page: StoryPage) {
  await Promise.all(page.textLayers.map(layer => document.fonts.load(`${layer.fontWeight} ${layer.fontSize}px ${getFontFamilyStack(layer.fontFamily)}`, layer.text)));
  await document.fonts.ready;
  const original = await renderStoryPageArtworkToCanvas(page);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 900 / Math.max(page.width, page.height));
  canvas.width = Math.round(page.width * scale); canvas.height = Math.round(page.height * scale);
  canvas.getContext('2d')!.drawImage(original, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function renderCandidate(page: StoryPage, artwork: HTMLCanvasElement, layer: StoryTextLayer, id: string, score = 0): TextCandidate {
  const canvas = document.createElement('canvas'); canvas.width = artwork.width; canvas.height = artwork.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(artwork, 0, 0);
  drawStoryPageText(ctx, { ...page, textLayers: page.textLayers.map(v => v.id === layer.id ? layer : v) },
    { x: 0, y: 0, width: canvas.width, height: canvas.height });
  const box = bounds(ctx, page, layer), scale = canvas.width / page.width;
  const x = Math.max(0, box.x * scale - 16), y = Math.max(0, box.y * scale - 16);
  const w = Math.max(1, Math.min(canvas.width - x, box.width * scale + 32));
  const h = Math.max(1, Math.min(canvas.height - y, box.height * scale + 32));
  const crop = document.createElement('canvas'); const zoom = Math.min(2, 900 / Math.max(w, h));
  crop.width = Math.ceil(w * zoom); crop.height = Math.ceil(h * zoom);
  crop.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, crop.width, crop.height);
  return { id, layer, score, preview: canvas.toDataURL('image/png'), detail: crop.toDataURL('image/png') };
}

/** Broad local search; AI reviews a small diverse rendered shortlist. */
export function generateCandidates(page: StoryPage, artwork: HTMLCanvasElement, lockPosition: boolean): TextCandidate[] {
  const layer = page.textLayers.find(v => v.id === 'main');
  if (!layer) return [];
  const ctx = document.createElement('canvas').getContext('2d')!;
  const pixels = artwork.getContext('2d')!.getImageData(0, 0, artwork.width, artwork.height);
  const original = { ...renderCandidate(page, artwork, layer, 'current'), original: true };
  const pool: { layer: StoryTextLayer; score: number; family: number }[] = [];
  const widths = lockPosition ? [layer.maxWidthPercent] : [...new Set([layer.maxWidthPercent, 38, 55, 76])];
  for (const width of widths) {
    const base = { ...layer, maxWidthPercent: width };
    const box = bounds(ctx, page, base);
    const positions = lockPosition ? [[layer.offsetX, layer.offsetY]] : [
      [layer.offsetX, layer.offsetY],
      ...[.18, .5, .82].flatMap(cx => [.18, .5, .82].map(cy => [
        Math.max(box.width / 2 + 20, Math.min(page.width - box.width / 2 - 20, page.width * cx)) - page.width / 2,
        Math.max(box.height + 25, Math.min(page.height - 25, page.height * cy + box.height / 2)) - page.height + 40,
      ])),
    ];
    for (const [offsetX, offsetY] of positions) {
      const positioned = { ...base, offsetX, offsetY };
      const region = sampleRegion(ctx, page, positioned, pixels);
      const darkText = region.mean > .52;
      const color = darkText ? '#202934' : '#fffaf0';
      const tint = '#' + region.rgb.map(v => Math.round(darkText ? 235 + v / 255 * 20 : v * .15).toString(16).padStart(2, '0')).join('');
      const styles: TextEffects[] = [
        effectsFromMode('none', 55), effectsFromMode('outline', 35), effectsFromMode('halo', 55),
        { ...effectsFromMode('wash', 50), color: tint, seed: page.index + 11 },
        { ...effectsFromMode('wash', 35), halo: 30, color: tint, seed: page.index + 37, feather: 75 },
      ];
      styles.forEach((effects, family) => {
        const candidate = { ...positioned, color, effects };
        if (!fitsPage(ctx, page, candidate)) return;
        const mismatch = darkText ? region.dark : 1 - region.dark;
        const protection = effects.backdrop !== 'none' ? .65 : effects.halo > 0 ? .35 : effects.outline > 0 ? .25 : 0;
        const intervention = effects.backdrop !== 'none' ? .18 : effects.halo > 0 ? .07 : effects.outline > 0 ? .06 : 0;
        const score = mismatch * (1 - protection) + region.edge * 7 * (1 - protection) + intervention
          + Math.hypot(offsetX - layer.offsetX, offsetY - layer.offsetY) / Math.max(page.width, page.height) * .04;
        pool.push({ layer: candidate, score, family });
      });
    }
  }
  pool.sort((a, b) => a.score - b.score);
  const chosen: typeof pool = [];
  for (const option of pool) {
    if (chosen.some(v => v.family === option.family && Math.hypot(v.layer.offsetX - option.layer.offsetX, v.layer.offsetY - option.layer.offsetY) < page.width * .15)) continue;
    chosen.push(option); if (chosen.length === 5) break;
  }
  return [original, ...chosen.map((v, i) => renderCandidate(page, artwork, v.layer, `candidate-${i + 1}`, v.score))];
}
