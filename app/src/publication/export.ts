import { invoke } from '@tauri-apps/api/core';
import type { ProjectState } from '../project/model';
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
  return getElectronicStoryPageCount(projectState);
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

function buildPublishedTextLayers(page: ReturnType<typeof buildStoryPages>[number]): PublishedTextLayer[] {
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
      fontSize: layout.fontSize,
      lineHeight: layout.lineHeight,
      color: layout.color,
      align: layout.alignment,
      strokeColor: layout.stroke?.color ?? null,
      strokeWidth: layout.stroke?.width ?? 0,
      shadow: layout.shadow,
      backdropColor: layout.backdrop?.color ?? null,
      backdropX: layout.backdrop?.x ?? null,
      backdropY: layout.backdrop?.y ?? null,
      backdropWidth: layout.backdrop?.width ?? null,
      backdropHeight: layout.backdrop?.height ?? null,
      backdropPaddingX: layout.fontSize * 0.5,
      backdropPaddingY: layout.fontSize * 0.2,
      backdropRadius: layout.backdrop?.radius ?? 0,
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
  const totalPages = storyPages.filter(page => !isPagePrintOnly(projectState, page.index)).length;
  if (totalPages === 0) throw new Error('PUBLICATION_NO_PAGES');
  const resources: PublishedResource[] = [];
  const archiveAssets: PublicationArchiveAsset[] = [];
  const pages: PublishedPage[] = [];
  const pageIds = new Map<number, string>();
  const sourceOccurrences = new Map<string, number>();

  for (const page of storyPages) {
    const sourceIndex = page.index;
    const sourceKey = projectState.visible_images[sourceIndex] || `blank:${sourceIndex}`;
    const occurrence = sourceOccurrences.get(sourceKey) ?? 0;
    sourceOccurrences.set(sourceKey, occurrence + 1);
    if (isPagePrintOnly(projectState, sourceIndex)) continue;

    const outputIndex = pages.length;
    const pageId = await createPublishedPageId(sourceKey, occurrence);
    pageIds.set(sourceIndex, pageId);
    const artworkPath = `pages/${String(outputIndex + 1).padStart(4, '0')}.webp`;
    const artworkCanvas = await renderStoryPageArtworkToCanvas(page);
    const artworkBytes = await canvasToWebpBytes(artworkCanvas);
    const sha256 = await sha256Hex(artworkBytes);

    pages.push({
      id: pageId,
      order: outputIndex,
      image: {
        src: artworkPath,
        width: page.width,
        height: page.height,
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

  const languages = getProjectLanguageTags(projectState).map(language => {
    const languageProjectState = resolveProjectLanguageState(projectState, language);
    const languagePages: PublishedLanguagePage[] = buildStoryPages(languageProjectState, imageSources)
      .filter(page => !isPagePrintOnly(projectState, page.index))
      .map(page => ({
        id: pageIds.get(page.index)!,
        role: page.role,
        textLayers: buildPublishedTextLayers(page),
      }));
    return {
      language,
      projectState: languageProjectState,
      pages: languagePages,
    };
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
