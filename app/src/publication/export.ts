import { invoke } from '@tauri-apps/api/core';
import type { ProjectState } from '../project/model';
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
  type PublishedPage,
  type PublishedResource,
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

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob || blob.type !== 'image/webp') {
        reject(new Error('PUBLICATION_WEBP_ENCODE_FAILED'));
        return;
      }
      resolve(blob);
    }, 'image/webp', 0.9);
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

export async function exportWebPublication({
  projectState,
  imageSources,
  targetPath,
  createdAt = new Date().toISOString(),
  onProgress,
}: ExportWebPublicationOptions): Promise<PublicationWriteResult> {
  const storyPages = buildStoryPages(projectState, imageSources);
  const resources: PublishedResource[] = [];
  const archiveAssets: PublicationArchiveAsset[] = [];
  const pages: PublishedPage[] = [];
  const sourceOccurrences = new Map<string, number>();

  for (let index = 0; index < storyPages.length; index += 1) {
    const page = storyPages[index];
    const sourceKey = projectState.visible_images[index] || `blank:${index}`;
    const occurrence = sourceOccurrences.get(sourceKey) ?? 0;
    sourceOccurrences.set(sourceKey, occurrence + 1);
    const pageId = await createPublishedPageId(sourceKey, occurrence);
    const artworkPath = `pages/${String(index + 1).padStart(4, '0')}.webp`;
    const artworkCanvas = await renderStoryPageArtworkToCanvas(page);
    const artworkBlob = await canvasToWebp(artworkCanvas);
    const artworkBytes = new Uint8Array(await artworkBlob.arrayBuffer());
    const measurementCanvas = document.createElement('canvas');
    measurementCanvas.width = page.width;
    measurementCanvas.height = page.height;
    const measurementContext = measurementCanvas.getContext('2d');
    if (!measurementContext) throw new Error('PUBLICATION_CANVAS_UNAVAILABLE');
    const textLayers = layoutStoryPageText(measurementContext, page).map(layout => ({
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

    const sha256 = await sha256Hex(artworkBytes);

    pages.push({
      id: pageId,
      order: index,
      role: page.role,
      image: {
        src: artworkPath,
        width: page.width,
        height: page.height,
        alt: null,
        mimeType: 'image/webp',
        bytes: artworkBytes.byteLength,
        sha256,
      },
      textLayers,
    });
    resources.push({
      path: artworkPath,
      mimeType: 'image/webp',
      bytes: artworkBytes.byteLength,
      sha256,
    });
    archiveAssets.push({ path: artworkPath, dataBase64: bytesToBase64(artworkBytes) });
    onProgress?.({ current: index + 1, total: storyPages.length });
  }

  const manifest = await buildPublicationManifest({ projectState, createdAt, pages, resources });
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  return invoke<PublicationWriteResult>('write_publication_package', {
    targetPath,
    manifestJson,
    assets: archiveAssets,
  });
}
