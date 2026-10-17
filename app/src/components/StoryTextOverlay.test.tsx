import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StoryTextOverlay } from './StoryTextOverlay';
import { effectsFromMode } from '../text-design/effects';
import { layoutStoryPageText, type StoryPage, type StoryTextLayer } from '../utils/storyPageRenderer';

vi.mock('../i18n', () => ({ default: { t: (key: string) => key } }));
afterEach(() => vi.unstubAllGlobals());

it('gives each frozen wash pass an explicit, unclipped SVG blur for the desktop WebView', () => {
  const context = { save: vi.fn(), restore: vi.fn(), measureText: (text: string) => ({ width: text.length * 10 }) } as unknown as CanvasRenderingContext2D;
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) });
  const layer: StoryTextLayer = { id: 'main', text: 'A longer first line\nShort', fontFamily: 'sans',
    fontWeight: 400, fontSize: 20, color: '#000000', readabilityMode: 'wash', readabilityStrength: 55,
    maxWidthPercent: 90, offsetX: 0, offsetY: -20, effects: effectsFromMode('wash', 55) };
  const wash = layoutStoryPageText(context, { width: 500, height: 400, textLayers: [layer] } as StoryPage)[0].backdrop!;
  const markup = renderToStaticMarkup(<StoryTextOverlay layer={layer} pageWidth={500} pageHeight={400} scale={0.5} />);
  const filters = [...markup.matchAll(/<filter\b[^>]*>(.*?)<\/filter>/g)];
  expect(filters).toHaveLength(wash.pigment!.length);
  wash.pigment!.forEach((pass, i) => {
    expect(filters[i][0]).toContain('filterUnits="userSpaceOnUse"');
    expect(filters[i][0]).toContain('color-interpolation-filters="sRGB"');
    expect(filters[i][1]).toContain(`stdDeviation="${pass.blur}"`);
    const bleed = Math.max(pass.blur * 4, pass.strokeWidth || 0);
    expect(filters[i][0]).toContain(`width="${wash.width + bleed * 2}"`);
  });
  expect(markup.match(/filter="url\(#[^)]+-wash-\d+\)"/g)).toHaveLength(wash.pigment!.length);
  expect(markup).not.toContain('filter:blur');
  expect(markup).toContain('A longer first line');
});
