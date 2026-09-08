import { invoke } from '@tauri-apps/api/core';
import type { ProjectState } from '../project/model';
import { waitForProjectFonts } from '../utils/fonts';
import {
  getDefaultProjectLanguage,
  getProjectLanguageTags,
  resolveProjectLanguageState,
} from '../project/languages';
import { getElectronicStoryPageCount, isPagePrintOnly } from '../project/pageSettings';
import {
  buildStoryPages,
  layoutStoryPageText,
  renderStoryPageArtworkToCanvas,
} from '../utils/storyPageRenderer';
import {
  buildPublicationManifest,
  createPublishedPageId,
  getPublishedFontId,
  sha256Hex,
  type PublishedLanguagePage,
  type PublishedPage,
  type PublishedResource,
  type PublishedTextLayer,
} from './format';

import {
  buildPublicationPage, copyrightPageInsertionIndex, layoutPublicationPage,
  shouldIncludeCopyrightPage, type PublicationPage,
} from './copyrightPage';

export interface PublicationExportProgress {
  current: number;
  total: number;
}

export interface PublicationWriteResult {
  path: string;
  bytes: number;
  sha256: string;
}

interface PublicationArchiveAsset {
  path: string;
  dataBase64: string;
}

export interface ExportWebPublicationOptions {
  projectState: ProjectState;
  imageSources: string[];
  targetPath: string;
  createdAt?: string;
  onProgress?: (progress: PublicationExportProgress) => void;
}

export function getWebPublicationPageCount(projectState: ProjectState): number {
  const state = resolveProjectLanguageState(projectState, getDefaultProjectLanguage(projectState));
  return getElectronicStoryPageCount(projectState) + Number(shouldIncludeCopyrightPage(state, 'electronic'));
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob || blob.type !== 'image/png') {
        reject(new Error('PUBLICATION_WEBP_ENCODE_FAILED'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function canvasToWebpBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const pngBlob = await canvasToPng(canvas);
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
  const webpBase64 = await invoke<string>('encode_publication_webp', {
    pngBase64: bytesToBase64(pngBytes),
  });
  return base64ToBytes(webpBase64);
}

export function buildPublishedTextLayers(page: ReturnType<typeof buildStoryPages>[number]): PublishedTextLayer[] {
  const measurementCanvas = document.createElement('canvas');
  measurementCanvas.width = page.width;
  measurementCanvas.height = page.height;
  const measurementContext = measurementCanvas.getContext('2d');
  if (!measurementContext) throw new Error('PUBLICATION_CANVAS_UNAVAILABLE');

  return layoutStoryPageText(measurementContext, page).map(layout => ({
    id: layout.id,
    text: layout.sourceText,
    lines: layout.lines,
    position: {
      x: layout.lines[0]?.x ?? page.width / 2,
      y: layout.lines[layout.lines.length - 1]?.y ?? page.height,
      maxWidth: layout.maxWidth,
      anchor: 'center-bottom' as const,
    },
    style: {
      font: getPublishedFontId(layout.fontFamily),
      fontFamily: layout.fontFamily,
      fontWeight: layout.fontWeight,
      fontSize: layout.fontSize,
      lineHeight: layout.lineHeight,
      color: layout.color,
      align: layout.alignment,
      baseline: 'bottom',
      strokeColor: layout.stroke?.color ?? null,
      strokeWidth: layout.stroke?.width ?? 0,
      shadow: layout.shadow,
      backdropKind: layout.backdrop?.kind ?? null,
      backdropColor: layout.backdrop?.color ?? null,
      backdropX: layout.backdrop?.x ?? null,
      backdropY: layout.backdrop?.y ?? null,
      backdropWidth: layout.backdrop?.width ?? null,
      backdropHeight: layout.backdrop?.height ?? null,
      backdropPaddingX: layout.backdrop?.paddingX ?? layout.fontSize * 0.5,
      backdropPaddingY: layout.backdrop?.paddingY ?? layout.fontSize * 0.2,
      backdropRadius: layout.backdrop?.radius ?? 0,
      backdropFeather: layout.backdrop?.feather ?? 0,
      backdropPath: layout.backdrop?.path ?? null,
      backdropPigment: layout.backdrop?.pigment?.map(pass => ({
        ...pass,
        strokeWidth: pass.strokeWidth ?? null,
      })) ?? null,
    },
  }));
}

export function buildPublishedCopyrightTextLayers(page: PublicationPage): PublishedTextLayer[] {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('PUBLICATION_CANVAS_UNAVAILABLE');
  return layoutPublicationPage(ctx, page).map((block, index) => ({
    id: `copyright-${index}`,
    text: block.lines.map(line => line.text).join('\n'),
    lines: block.lines,
    position: { x: block.lines[0]?.x ?? 0, y: block.lines[0]?.y ?? 0,
      maxWidth: block.maxWidth, anchor: 'center-bottom' },
    style: {
      font: getPublishedFontId(page.fontFamily), fontFamily: page.fontFamily,
      fontWeight: block.fontWeight, fontSize: block.fontSize, lineHeight: block.lineHeight,
      color: block.color, align: 'left', baseline: 'top', strokeColor: null, strokeWidth: 0, shadow: null,
      backdropKind: block.separator ? 'panel' : null, backdropColor: block.separator?.color ?? null,
      backdropX: block.separator?.x ?? null, backdropY: block.separator?.y ?? null,
      backdropWidth: block.separator?.width ?? null, backdropHeight: block.separator?.height ?? null,
      backdropPaddingX: 0, backdropPaddingY: 0, backdropRadius: 0, backdropFeather: 0,
      backdropPath: null, backdropPigment: null,
    },
  }));
}

export async function exportWebPublication({
  projectState,
  imageSources,
  targetPath,
  createdAt = new Date().toISOString(),
  onProgress,
}: ExportWebPublicationOptions): Promise<PublicationWriteResult> {
  const defaultLanguage = getDefaultProjectLanguage(projectState);
  const defaultProjectState = resolveProjectLanguageState(projectState, defaultLanguage);
  const storyPages = buildStoryPages(defaultProjectState, imageSources);
  const electronicPages = storyPages.filter(page => !isPagePrintOnly(projectState, page.index));
  if (electronicPages.length === 0) throw new Error('PUBLICATION_NO_PAGES');
  const languageStates = getProjectLanguageTags(projectState).map(language => ({
    language, state: resolveProjectLanguageState(projectState, language),
  }));
  await Promise.all(languageStates.map(({ state }) => waitForProjectFonts(state)));
  const includeCopyright = languageStates.some(({ state }) => shouldIncludeCopyrightPage(state, 'electronic'));
  const sharedPages: Array<(typeof storyPages)[number] | null> = [...electronicPages];
  if (includeCopyright) sharedPages.splice(copyrightPageInsertionIndex(electronicPages), 0, null);
  const totalPages = sharedPages.length;
  const resources: PublishedResource[] = [];
  const archiveAssets: PublicationArchiveAsset[] = [];
  const pages: PublishedPage[] = [];
  const pageIds = new Map<number, string>();
  const sourceOccurrences = new Map<string, number>();

  // Count source occurrences before filtering, so print-only changes do not change story IDs.
  for (const page of storyPages) {
    const sourceKey = projectState.visible_images[page.index] || `blank:${page.index}`;
    const occurrence = sourceOccurrences.get(sourceKey) ?? 0;
    sourceOccurrences.set(sourceKey, occurrence + 1);
    pageIds.set(page.index, await createPublishedPageId(sourceKey, occurrence));
  }
  const copyrightPageId = await createPublishedPageId('synthetic:copyright', 0);
  for (const page of sharedPages) {
    const outputIndex = pages.length;
    const pageId = page ? pageIds.get(page.index)! : copyrightPageId;
    const artworkPath = `pages/${String(outputIndex + 1).padStart(4, '0')}.webp`;
    const artworkCanvas = page ? await renderStoryPageArtworkToCanvas(page) : document.createElement('canvas');
    if (!page) {
      artworkCanvas.width = defaultProjectState.canvas_width || 1024;
      artworkCanvas.height = defaultProjectState.canvas_height || 1024;
      const ctx = artworkCanvas.getContext('2d');
      if (!ctx) throw new Error('PUBLICATION_CANVAS_UNAVAILABLE');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, artworkCanvas.width, artworkCanvas.height);
    }
    const artworkBytes = await canvasToWebpBytes(artworkCanvas);
    const sha256 = await sha256Hex(artworkBytes);

    pages.push({
      id: pageId,
      order: outputIndex,
      image: {
        src: artworkPath,
        width: artworkCanvas.width,
        height: artworkCanvas.height,
        alt: null,
        mimeType: 'image/webp',
        bytes: artworkBytes.byteLength,
        sha256,
      },
    });
    resources.push({
      path: artworkPath,
      mimeType: 'image/webp',
      bytes: artworkBytes.byteLength,
      sha256,
    });
    archiveAssets.push({ path: artworkPath, dataBase64: bytesToBase64(artworkBytes) });
    onProgress?.({ current: outputIndex + 1, total: totalPages });
  }

  const languages = languageStates.map(({ language, state }) => {
    const languageStoryPages = new Map(buildStoryPages(state, imageSources).map(page => [page.index, page]));
    const languagePages: PublishedLanguagePage[] = sharedPages.flatMap<PublishedLanguagePage>(page => {
      if (!page) {
        return shouldIncludeCopyrightPage(state, 'electronic')
          ? [{ id: copyrightPageId, role: 'copyright' as const,
            textLayers: buildPublishedCopyrightTextLayers(buildPublicationPage(state)) }]
          : [];
      }
      const localized = languageStoryPages.get(page.index)!;
      return [{ id: pageIds.get(page.index)!, role: localized.role, textLayers: buildPublishedTextLayers(localized) }];
    });
    return { language, projectState: state, pages: languagePages };
  });
  const manifest = await buildPublicationManifest({
    projectState,
    createdAt,
    defaultLanguage,
    languages,
    pages,
    resources,
  });
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  return invoke<PublicationWriteResult>('write_publication_package', {
    targetPath,
    manifestJson,
    assets: archiveAssets,
  });
}
