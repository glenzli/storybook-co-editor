import type {
  ImageAdjustments,
  PageTextOverride,
  ProjectState,
  TextReadabilityMode,
  TextSettings,
} from '../project/model';
import i18n from '../i18n';
import { applyProAdjustments, type ProAdjustments } from './imageProcessor';
import { getFontFamilyStack, normalizeFontWeight } from './fonts';
import { parseStoryScript } from '../story/script';

export const STORY_TEXT_BOTTOM = 40;
export const STORY_TEXT_LINE_HEIGHT = 1.5;
export const STORY_TEXT_DEFAULT_WIDTH_PERCENT = 90;
export const STORY_TEXT_MIN_WIDTH_PERCENT = 30;
export const STORY_TEXT_MAX_WIDTH_PERCENT = 96;
export const STORY_TEXT_DEFAULT_READABILITY_STRENGTH = 55;
export const STORY_TEXT_WASH_SVG_PATH = 'M3 21 C8 8 21 12 31 6 C43 1 55 10 66 5 C79 0 92 9 97 20 L99 73 C94 89 81 83 69 94 C55 101 43 91 31 97 C18 102 7 91 2 77 Z';

export interface StoryTextLayer {
  id: 'main' | 'author';
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  color: string;
  readabilityMode: TextReadabilityMode;
  readabilityStrength: number;
  maxWidthPercent: number;
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

export interface StoryTextLineLayout {
  text: string;
  x: number;
  y: number;
}

export interface StoryTextLayout {
  id: StoryTextLayer['id'];
  sourceText: string;
  fontFamily: string;
  fontFamilyStack: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: number;
  color: string;
  alignment: 'center';
  baseline: 'bottom';
  maxWidth: number;
  lines: StoryTextLineLayout[];
  stroke: { color: string; width: number; lineJoin: 'round' } | null;
  shadow: { color: string; blur: number; spread: number } | null;
  backdrop: {
    kind: 'panel' | 'wash';
    color: string;
    x: number;
    y: number;
    width: number;
    height: number;
    paddingX: number;
    paddingY: number;
    radius: number;
    feather: number;
    path: string | null;
  } | null;
}

export interface StoryTextReadabilityPaint {
  stroke: StoryTextLayout['stroke'];
  shadow: StoryTextLayout['shadow'];
  backdrop: null | {
    kind: 'panel' | 'wash';
    color: string;
    paddingX: number;
    paddingY: number;
    radius: number;
    feather: number;
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isTextReadabilityMode(value: unknown): value is TextReadabilityMode {
  return value === 'none'
    || value === 'outline'
    || value === 'halo'
    || value === 'wash'
    || value === 'panel';
}

export function resolveTextReadabilityMode(settings?: TextSettings): TextReadabilityMode {
  if (isTextReadabilityMode(settings?.readability_mode)) return settings.readability_mode;
  if (settings?.has_backdrop) return 'panel';
  return settings?.has_shadow === false ? 'none' : 'outline';
}

export function normalizeTextReadabilityStrength(value?: number): number {
  return clamp(value ?? STORY_TEXT_DEFAULT_READABILITY_STRENGTH, 20, 100);
}

export function normalizeStoryTextWidthPercent(value?: number): number {
  return clamp(
    value ?? STORY_TEXT_DEFAULT_WIDTH_PERCENT,
    STORY_TEXT_MIN_WIDTH_PERCENT,
    STORY_TEXT_MAX_WIDTH_PERCENT,
  );
}

function getTextBrightness(hexColor: string): number {
  let hex = hexColor.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(char => char + char).join('');
  const red = Number.parseInt(hex.substring(0, 2), 16) || 0;
  const green = Number.parseInt(hex.substring(2, 4), 16) || 0;
  const blue = Number.parseInt(hex.substring(4, 6), 16) || 0;
  return ((red * 299) + (green * 587) + (blue * 114)) / 1000;
}

function getContrastRgba(hexColor: string, alpha: number, warm: boolean): string {
  if (getTextBrightness(hexColor) >= 128) {
    return `rgba(${warm ? '18,32,46' : '0,0,0'},${alpha.toFixed(3)})`;
  }
  return `rgba(${warm ? '255,250,235' : '255,255,255'},${alpha.toFixed(3)})`;
}

export function getStrokeColor(hexColor: string): string {
  return getContrastRgba(hexColor, 0.8, false);
}

export function getBackdropColor(color: string): string {
  return getContrastRgba(color, 0.35, true);
}

export function getStoryTextReadabilityPaint(
  mode: TextReadabilityMode,
  color: string,
  fontSize: number,
  strength: number,
): StoryTextReadabilityPaint {
  const normalizedStrength = normalizeTextReadabilityStrength(strength);
  if (mode === 'outline') {
    return {
      stroke: {
        color: getContrastRgba(color, 0.72 + normalizedStrength * 0.0016, false),
        width: fontSize * (0.045 + normalizedStrength * 0.00064),
        lineJoin: 'round',
      },
      shadow: null,
      backdrop: null,
    };
  }
  if (mode === 'halo') {
    return {
      stroke: null,
      shadow: {
        color: getContrastRgba(color, 0.5 + normalizedStrength * 0.0025, true),
        blur: fontSize * (0.09 + normalizedStrength * 0.0015),
        spread: fontSize * (0.018 + normalizedStrength * 0.00025),
      },
      backdrop: null,
    };
  }
  if (mode === 'panel' || mode === 'wash') {
    const wash = mode === 'wash';
    return {
      stroke: null,
      shadow: null,
      backdrop: {
        kind: mode,
        color: getContrastRgba(
          color,
          wash
            ? 0.18 + normalizedStrength * 0.0025
            : 0.23 + normalizedStrength * 0.0022,
          wash,
        ),
        paddingX: fontSize * (wash ? 0.68 : 0.5),
        paddingY: fontSize * (wash ? 0.32 : 0.2),
        radius: fontSize * (wash ? 0.5 : 0.3),
        feather: wash ? fontSize * (0.035 + normalizedStrength * 0.0008) : 0,
      },
    };
  }
  return { stroke: null, shadow: null, backdrop: null };
}

export function createStoryTextWashPath(
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  const point = (xRatio: number, yRatio: number) => `${(x + width * xRatio).toFixed(2)} ${(y + height * yRatio).toFixed(2)}`;
  return [
    `M${point(0.03, 0.21)}`,
    `C${point(0.08, 0.08)} ${point(0.21, 0.12)} ${point(0.31, 0.06)}`,
    `C${point(0.43, 0.01)} ${point(0.55, 0.10)} ${point(0.66, 0.05)}`,
    `C${point(0.79, 0)} ${point(0.92, 0.09)} ${point(0.97, 0.20)}`,
    `L${point(0.99, 0.73)}`,
    `C${point(0.94, 0.89)} ${point(0.81, 0.83)} ${point(0.69, 0.94)}`,
    `C${point(0.55, 1.01)} ${point(0.43, 0.91)} ${point(0.31, 0.97)}`,
    `C${point(0.18, 1.02)} ${point(0.07, 0.91)} ${point(0.02, 0.77)}`,
    'Z',
  ].join(' ');
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
  overrides?: PageTextOverride,
): StoryTextLayer {
  const readabilityMode = overrides?.readability_mode ?? resolveTextReadabilityMode(settings);
  return {
    id,
    text,
    fontFamily: settings?.font_family || 'serif',
    fontWeight: normalizeFontWeight(settings?.font_family, settings?.font_weight),
    fontSize: settings?.font_size || defaultFontSize,
    color: (overrides?.text_color ?? settings?.text_color) || '#ffffff',
    readabilityMode,
    readabilityStrength: normalizeTextReadabilityStrength(
      overrides?.readability_strength ?? settings?.readability_strength,
    ),
    maxWidthPercent: normalizeStoryTextWidthPercent(
      overrides?.max_width_percent ?? settings?.max_width_percent,
    ),
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

export function layoutStoryPageText(
  ctx: CanvasRenderingContext2D,
  page: StoryPage,
  viewport: StoryPageViewport = { x: 0, y: 0, width: page.width, height: page.height },
): StoryTextLayout[] {
  const scale = Math.min(viewport.width / page.width, viewport.height / page.height);

  return page.textLayers.flatMap(layer => {
    if (!layer.text) return [];

    ctx.save();
    const fontSize = layer.fontSize * scale;
    const fontFamilyStack = getFontFamilyStack(layer.fontFamily);
    ctx.font = `${layer.fontWeight} ${fontSize}px ${fontFamilyStack}`;
    const centerX = viewport.x + viewport.width / 2 + layer.offsetX * scale;
    const bottomY = viewport.y + viewport.height - (STORY_TEXT_BOTTOM - layer.offsetY) * scale;
    const maxWidth = Math.max(1, page.width * (layer.maxWidthPercent / 100) * scale);
    const frozenLines = wrapText(ctx, layer.text, maxWidth);
    const lineHeight = fontSize * STORY_TEXT_LINE_HEIGHT;
    const lines = frozenLines.map((text, lineIndex) => ({
      text,
      x: centerX,
      y: bottomY - (frozenLines.length - 1 - lineIndex) * lineHeight,
    }));
    const maxLineWidth = frozenLines.length > 0
      ? Math.max(...frozenLines.map(line => ctx.measureText(line).width))
      : 0;
    const readability = getStoryTextReadabilityPaint(
      layer.readabilityMode,
      layer.color,
      fontSize,
      layer.readabilityStrength,
    );
    const paddingX = readability.backdrop?.paddingX ?? 0;
    const paddingY = readability.backdrop?.paddingY ?? 0;
    const textHeight = frozenLines.length * lineHeight;
    const backdrop = readability.backdrop && frozenLines.length > 0
      ? {
          kind: readability.backdrop.kind,
          color: readability.backdrop.color,
          x: centerX - (maxLineWidth + paddingX * 2) / 2,
          y: bottomY - textHeight - paddingY + lineHeight * 0.25,
          width: maxLineWidth + paddingX * 2,
          height: textHeight + paddingY * 2,
          paddingX,
          paddingY,
          radius: readability.backdrop.radius,
          feather: readability.backdrop.feather,
          path: null as string | null,
        }
      : null;
    if (backdrop?.kind === 'wash') {
      backdrop.path = createStoryTextWashPath(
        backdrop.x,
        backdrop.y,
        backdrop.width,
        backdrop.height,
      );
    }
    ctx.restore();

    return [{
      id: layer.id,
      sourceText: layer.text,
      fontFamily: layer.fontFamily,
      fontFamilyStack,
      fontWeight: layer.fontWeight,
      fontSize,
      lineHeight,
      color: layer.color,
      alignment: 'center',
      baseline: 'bottom',
      maxWidth,
      lines,
      stroke: readability.stroke,
      shadow: readability.shadow,
      backdrop,
    }];
  });
}

export function drawStoryPageText(
  ctx: CanvasRenderingContext2D,
  page: StoryPage,
  viewport: StoryPageViewport = { x: 0, y: 0, width: page.width, height: page.height },
): void {
  layoutStoryPageText(ctx, page, viewport).forEach(layout => {
    ctx.save();
    ctx.font = `${layout.fontWeight} ${layout.fontSize}px ${layout.fontFamilyStack}`;
    ctx.textAlign = layout.alignment;
    ctx.textBaseline = layout.baseline;

    if (layout.backdrop?.kind === 'wash' && layout.backdrop.path) {
      ctx.save();
      ctx.fillStyle = layout.backdrop.color;
      ctx.filter = `blur(${layout.backdrop.feather}px)`;
      ctx.fill(new Path2D(layout.backdrop.path));
      ctx.restore();
    } else if (layout.backdrop) {
      ctx.fillStyle = layout.backdrop.color;
      drawRoundedRect(
        ctx,
        layout.backdrop.x,
        layout.backdrop.y,
        layout.backdrop.width,
        layout.backdrop.height,
        layout.backdrop.radius,
      );
      ctx.fill();
    }

    if (layout.shadow) {
      ctx.save();
      ctx.strokeStyle = layout.shadow.color;
      ctx.lineWidth = layout.shadow.spread * 2;
      ctx.lineJoin = 'round';
      ctx.shadowColor = layout.shadow.color;
      ctx.shadowBlur = layout.shadow.blur;
      for (const line of layout.lines) {
        ctx.strokeText(line.text, line.x, line.y);
      }
      ctx.restore();
    }

    if (layout.stroke) {
      ctx.strokeStyle = layout.stroke.color;
      ctx.lineWidth = layout.stroke.width;
      ctx.lineJoin = layout.stroke.lineJoin;
      ctx.miterLimit = 2;
      for (const line of layout.lines) {
        ctx.strokeText(line.text, line.x, line.y);
      }
    }

    ctx.fillStyle = layout.color;
    for (const line of layout.lines) {
      ctx.fillText(line.text, line.x, line.y);
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

export async function renderStoryPageArtworkToCanvas(page: StoryPage): Promise<HTMLCanvasElement> {
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

  return canvas;
}

export async function renderStoryPageToCanvas(page: StoryPage): Promise<HTMLCanvasElement> {
  const canvas = await renderStoryPageArtworkToCanvas(page);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(i18n.t('errors.canvasUnavailable'));
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
