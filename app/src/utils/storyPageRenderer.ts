import type { ImageAdjustments, ProjectState, TextSettings } from '../project/model';
import i18n from '../i18n';
import { applyProAdjustments, type ProAdjustments } from './imageProcessor';
import { getFontFamilyStack } from './fonts';
import { parseStoryScript } from '../story/script';

export const STORY_TEXT_BOTTOM = 40;
export const STORY_TEXT_HORIZONTAL_PADDING = 48;
export const STORY_TEXT_LINE_HEIGHT = 1.5;

export interface StoryTextLayer {
  id: 'main' | 'author';
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  hasShadow: boolean;
  hasBackdrop: boolean;
  offsetX: number;
  offsetY: number;
}

export interface StoryImageLayer {
  source: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  backgroundColor: string;
  adjustments: ProAdjustments;
}

export interface StoryPage {
  index: number;
  role: 'cover' | 'title' | 'body';
  width: number;
  height: number;
  image: StoryImageLayer;
  textLayers: StoryTextLayer[];
}

export interface StoryPageViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getStrokeColor(hexColor: string): string {
  let hex = hexColor.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(char => char + char).join('');
  const red = Number.parseInt(hex.substring(0, 2), 16) || 0;
  const green = Number.parseInt(hex.substring(2, 4), 16) || 0;
  const blue = Number.parseInt(hex.substring(4, 6), 16) || 0;
  const brightness = ((red * 299) + (green * 587) + (blue * 114)) / 1000;
  return brightness >= 128 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)';
}

export function getBackdropColor(color: string): string {
  return getStrokeColor(color).replace('0.8)', '0.35)');
}

export function getProAdjustments(adjustments?: ImageAdjustments): ProAdjustments {
  return {
    brightness: adjustments?.brightness ?? 0,
    exposure: adjustments?.exposure ?? 0,
    highlights: adjustments?.highlights ?? 0,
    shadows: adjustments?.shadows ?? 0,
    contrast: adjustments?.contrast ?? 0,
    saturate: adjustments?.saturate ?? 0,
    temperature: adjustments?.temperature ?? 0,
    tint: adjustments?.tint ?? 0,
    selective_colors: adjustments?.selective_colors || [],
    remove_white_bg: adjustments?.remove_white_bg ?? 0,
    remove_bg_color: adjustments?.remove_bg_color,
  };
}

function buildTextLayer(
  id: StoryTextLayer['id'],
  text: string,
  settings: TextSettings | undefined,
  defaultFontSize: number,
  overrides?: { offset_x: number; offset_y: number; text_color?: string },
): StoryTextLayer {
  return {
    id,
    text,
    fontFamily: settings?.font_family || 'serif',
    fontSize: settings?.font_size || defaultFontSize,
    color: (overrides?.text_color ?? settings?.text_color) || '#ffffff',
    hasShadow: settings?.has_shadow ?? true,
    hasBackdrop: settings?.has_backdrop ?? false,
    offsetX: overrides?.offset_x ?? settings?.offset_x ?? 0,
    offsetY: overrides?.offset_y ?? settings?.offset_y ?? 0,
  };
}

export function buildStoryPages(projectState: ProjectState, imageSources?: string[]): StoryPage[] {
  const parsed = parseStoryScript(projectState.global_script || '');
  const sources = imageSources || projectState.visible_images;
  const width = projectState.canvas_width || 1024;
  const height = projectState.canvas_height || 1024;

  return sources.map((source, index) => {
    const role: StoryPage['role'] = index === 0
      ? 'cover'
      : parsed.hasTitle && index === 1
        ? 'title'
        : 'body';
    const settings = role === 'cover'
      ? projectState.cover_text_settings
      : role === 'title'
        ? projectState.title_text_settings
        : projectState.inner_text_settings;
    const imageAdjustments = projectState.image_adjustments?.[String(index)];
    const textLayers: StoryTextLayer[] = [];
    const mainText = parsed.pageText.get(index);

    if (mainText) {
      const defaultFontSize = role === 'cover' ? 40 : role === 'title' ? 32 : 20;
      const pageOverride = role === 'body'
        ? projectState.page_text_overrides?.[String(index)]
        : undefined;
      textLayers.push(buildTextLayer('main', mainText, settings, defaultFontSize, pageOverride));
    }

    const author = parsed.author || projectState.author_name || '';
    if (role === 'cover' && author) {
      textLayers.push(buildTextLayer('author', author, projectState.author_text_settings, 16));
    }

    return {
      index,
      role,
      width,
      height,
      image: {
        source,
        scale: imageAdjustments?.scale ?? 1,
        offsetX: imageAdjustments?.offset_x ?? 0,
        offsetY: imageAdjustments?.offset_y ?? 0,
        backgroundColor: imageAdjustments?.bg_color || 'transparent',
        adjustments: getProAdjustments(imageAdjustments),
      },
      textLayers,
    };
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];

  text.split('\n').forEach(paragraph => {
    if (paragraph.length === 0) {
      lines.push('');
      return;
    }

    let currentLine = '';
    for (const char of paragraph) {
      const testLine = currentLine + char;
      if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
  });

  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

export function drawStoryPageText(
  ctx: CanvasRenderingContext2D,
  page: StoryPage,
  viewport: StoryPageViewport = { x: 0, y: 0, width: page.width, height: page.height },
): void {
  const scale = Math.min(viewport.width / page.width, viewport.height / page.height);

  page.textLayers.forEach(layer => {
    if (!layer.text) return;

    ctx.save();
    const scaledFontSize = layer.fontSize * scale;
    ctx.font = `${scaledFontSize}px ${getFontFamilyStack(layer.fontFamily)}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const centerX = viewport.x + viewport.width / 2 + layer.offsetX * scale;
    const bottomY = viewport.y + viewport.height - (STORY_TEXT_BOTTOM - layer.offsetY) * scale;
    const maxWidth = Math.max(1, (page.width - STORY_TEXT_HORIZONTAL_PADDING * 2) * scale);
    const lines = wrapText(ctx, layer.text, maxWidth);
    const lineHeight = scaledFontSize * STORY_TEXT_LINE_HEIGHT;

    if (layer.hasBackdrop && lines.length > 0) {
      const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
      const paddingX = scaledFontSize * 0.5;
      const paddingY = scaledFontSize * 0.2;
      const textHeight = lines.length * lineHeight;
      const rectWidth = maxLineWidth + paddingX * 2;
      const rectHeight = textHeight + paddingY * 2;
      const rectX = centerX - rectWidth / 2;
      const rectY = bottomY - textHeight - paddingY + lineHeight * 0.25;

      ctx.fillStyle = getBackdropColor(layer.color);
      drawRoundedRect(ctx, rectX, rectY, rectWidth, rectHeight, scaledFontSize * 0.3);
      ctx.fill();
    }

    if (layer.hasShadow) {
      ctx.strokeStyle = getStrokeColor(layer.color);
      ctx.lineWidth = scaledFontSize * 0.08;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex -= 1) {
        const y = bottomY - (lines.length - 1 - lineIndex) * lineHeight;
        ctx.strokeText(lines[lineIndex], centerX, y);
      }
    }

    ctx.fillStyle = layer.color;
    for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex -= 1) {
      const y = bottomY - (lines.length - 1 - lineIndex) * lineHeight;
      ctx.fillText(lines[lineIndex], centerX, y);
    }
    ctx.restore();
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${source}`));
    image.src = source;
  });
}

function hasPixelAdjustments(adjustments: ProAdjustments): boolean {
  return adjustments.brightness !== 0
    || adjustments.exposure !== 0
    || adjustments.highlights !== 0
    || adjustments.shadows !== 0
    || adjustments.contrast !== 0
    || adjustments.saturate !== 0
    || adjustments.temperature !== 0
    || adjustments.tint !== 0
    || (adjustments.remove_white_bg ?? 0) > 0
    || (adjustments.selective_colors?.length ?? 0) > 0;
}

export async function renderStoryPageToCanvas(page: StoryPage): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error(i18n.t('errors.canvasUnavailable'));

  ctx.fillStyle = page.image.backgroundColor === 'transparent' ? '#ffffff' : page.image.backgroundColor;
  ctx.fillRect(0, 0, page.width, page.height);

  if (!page.image.source.startsWith('blank://')) {
    const image = await loadImage(page.image.source);
    const processed = document.createElement('canvas');
    processed.width = image.naturalWidth;
    processed.height = image.naturalHeight;
    const processedCtx = processed.getContext('2d', { willReadFrequently: true });
    if (!processedCtx) throw new Error(i18n.t('errors.canvasUnavailable'));
    processedCtx.drawImage(image, 0, 0);

    if (hasPixelAdjustments(page.image.adjustments)) {
      const imageData = processedCtx.getImageData(0, 0, processed.width, processed.height);
      applyProAdjustments(imageData, page.image.adjustments);
      processedCtx.putImageData(imageData, 0, 0);
    }

    const containScale = Math.min(page.width / image.naturalWidth, page.height / image.naturalHeight);
    const drawWidth = image.naturalWidth * containScale * page.image.scale;
    const drawHeight = image.naturalHeight * containScale * page.image.scale;
    const offsetX = page.width * (page.image.offsetX / 100);
    const offsetY = page.height * (page.image.offsetY / 100);
    const drawX = (page.width - drawWidth) / 2 + offsetX;
    const drawY = (page.height - drawHeight) / 2 + offsetY;
    ctx.drawImage(processed, drawX, drawY, drawWidth, drawHeight);
  }

  drawStoryPageText(ctx, page);
  return canvas;
}

export function getDefaultExportFilename(projectState: ProjectState, suffix = ''): string {
  let filename = '';
  for (const line of (projectState.global_script || '').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('[')) {
      filename = trimmed.substring(0, 30);
      break;
    }
  }

  if (!filename && projectState.project_name.trim() !== 'Untitled') {
    filename = projectState.project_name;
  }

  const safeName = (filename || i18n.t('common.untitled')).replace(/[/\\?%*:|"<>]/g, '-');
  return `${safeName}${suffix}`;
}
