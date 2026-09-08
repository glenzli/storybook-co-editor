import { afterEach, describe, expect, it, vi } from 'vitest';
import { layoutPublicationPage, renderPublicationPageToCanvas, shouldIncludeCopyrightPage, type PublicationPage } from './copyrightPage';
import { buildPublishedCopyrightTextLayers } from './export';
import type { ProjectState } from '../project/model';

vi.mock('../i18n', () => ({ default: { t: (key: string) => key } }));
afterEach(() => vi.unstubAllGlobals());

const page: PublicationPage = {
  width: 1024, height: 1024, fontFamily: 'Noto Sans SC', heading: 'Copyright', title: 'A published book',
  remainingMetadata: 'Additional details are in publication metadata',
  contributors: [{ label: 'Author', value: 'An Author' }],
  details: [{ label: 'DOI', value: '10.1234/example' }],
  rights: ['© 2026 An Author', 'CC BY-NC-ND 4.0', 'https://creativecommons.org/licenses/by-nc-nd/4.0/'],
};

function measurementContext() {
  return { font: '', fillStyle: '', textBaseline: '', textAlign: '',
    measureText: (text: string) => ({ width: text.length * 8 }),
    fillText: vi.fn(), fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('shared copyright page layout', () => {
  it('uses identical frozen positions and separators for PDF canvas and web text layers', () => {
    const ctx = measurementContext();
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
    const blocks = layoutPublicationPage(ctx, page);
    const published = buildPublishedCopyrightTextLayers(page);
    renderPublicationPageToCanvas(page);
    expect(published.map(layer => layer.lines)).toEqual(blocks.map(block => block.lines));
    expect(vi.mocked(ctx.fillText).mock.calls).toEqual(blocks.flatMap(block => block.lines.map(line => [line.text, line.x, line.y])));
    expect(ctx.textBaseline).toBe('top');
    for (const [index, block] of blocks.entries()) {
      expect(published[index].style).toMatchObject({ baseline: 'top', align: 'left', fontSize: block.fontSize, fontWeight: block.fontWeight });
      if (block.separator) expect(published[index].style).toMatchObject({ backdropKind: 'panel', backdropX: block.separator.x, backdropY: block.separator.y, backdropWidth: block.separator.width, backdropHeight: block.separator.height });
    }
    expect(blocks.filter(block => block.separator)).toHaveLength(2);
  });

  it('keeps long copyright content inside the page and signals overflow', () => {
    const blocks = layoutPublicationPage(measurementContext(), { ...page,
      details: Array.from({ length: 100 }, () => ({ label: 'Identifier', value: 'long identifier '.repeat(100) })),
    });
    expect(blocks.some(block => block.text === page.remainingMetadata)).toBe(true);
    expect(blocks.flatMap(block => block.lines).every(line => line.y >= 0 && line.y < page.height)).toBe(true);
  });

  it('omits copyright without metadata and distinguishes electronic versus printed output', () => {
    const state = { publication_metadata: {} } as ProjectState;
    expect(shouldIncludeCopyrightPage(state, 'electronic')).toBe(false);
    state.publication_metadata = { title: 'Book', copyright_page_mode: 'electronic' };
    expect(shouldIncludeCopyrightPage(state, 'electronic')).toBe(true);
    expect(shouldIncludeCopyrightPage(state, 'print')).toBe(false);
    state.publication_metadata.copyright_page_mode = 'all';
    expect(shouldIncludeCopyrightPage(state, 'print')).toBe(true);
    state.publication_metadata.copyright_page_mode = 'none';
    expect(shouldIncludeCopyrightPage(state, 'electronic')).toBe(false);
  });
});
