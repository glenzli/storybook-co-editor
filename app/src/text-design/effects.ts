import type { TextEffects, TextReadabilityMode, TextSettings } from '../project/model';
import type { StoryTextReadabilityPaint } from '../utils/storyPageRenderer';
const STORY_TEXT_DEFAULT_READABILITY_STRENGTH = 55;
const STORY_TEXT_DEFAULT_WIDTH_PERCENT = 90;
const STORY_TEXT_MIN_WIDTH_PERCENT = 30;
const STORY_TEXT_MAX_WIDTH_PERCENT = 96;
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
  effects?: TextEffects,
): StoryTextReadabilityPaint {
  if (effects) return compositePaint(effects, color, fontSize);
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


const finite = (value: number, fallback: number, min = 0, max = 100) =>
  Number.isFinite(value) ? clamp(value, min, max) : fallback;

export function normalizeEffects(effects: TextEffects): TextEffects {
  return {
    outline: finite(effects.outline, 0), halo: finite(effects.halo, 0),
    backdrop: effects.backdrop === 'wash' || effects.backdrop === 'panel' ? effects.backdrop : 'none',
    strength: finite(effects.strength, 55, 20),
    seed: Math.floor(finite(effects.seed, 1, 0, 4294967295)),
    roughness: finite(effects.roughness, 35), feather: finite(effects.feather, 55),
    color: /^#[\da-f]{6}$/i.test(effects.color || '') ? effects.color : undefined,
  };
}

export function effectsFromMode(mode: TextReadabilityMode, strength: number): TextEffects {
  return normalizeEffects({ outline: mode === 'outline' ? strength : 0,
    halo: mode === 'halo' ? strength : 0, backdrop: mode === 'wash' || mode === 'panel' ? mode : 'none',
    strength, seed: 1, roughness: 35, feather: 55 });
}

function compositePaint(raw: TextEffects, color: string, fontSize: number): StoryTextReadabilityPaint {
  const effects = normalizeEffects(raw);
  const paint = getStoryTextReadabilityPaint(effects.backdrop === 'none' ? 'none' : effects.backdrop, color, fontSize, effects.strength);
  if (effects.outline > 0) paint.stroke = getStoryTextReadabilityPaint('outline', color, fontSize, effects.outline).stroke;
  if (effects.halo > 0) paint.shadow = getStoryTextReadabilityPaint('halo', color, fontSize, effects.halo).shadow;
  if (paint.backdrop) {
    if (effects.backdrop === 'wash') paint.backdrop.feather = fontSize * (0.02 + effects.feather * 0.002);
    if (effects.color) {
      const rgb = effects.color.slice(1).match(/../g)!.map(v => parseInt(v, 16));
      paint.backdrop.color = `rgba(${rgb.join(',')},${(0.18 + effects.strength * 0.0025).toFixed(3)})`;
    }
  }
  return paint;
}

/** A repeatable continuous contour follows line widths; no stored raster or model needed. */
export function createAdaptiveWashPath(x: number, y: number, width: number, height: number,
  lineWidths: number[], padding: number, raw: TextEffects): string {
  const effects = normalizeEffects(raw);
  let seed = effects.seed || 1;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const rows = lineWidths.length || 1;
  const samples = Math.max(10, rows * 4);
  const points: [number, number][] = [];
  const half = (t: number) => {
    const row = clamp(t * rows - 0.5, 0, rows - 1);
    const i = Math.floor(row), f = row - i;
    const a = lineWidths[i] ?? width - padding * 2, b = lineWidths[Math.min(i + 1, rows - 1)] ?? a;
    // Keep a broad connected body even beside short final lines.
    return Math.min(width / 2, Math.max(width * 0.24, (a * (1 - f) + b * f) / 2 + padding));
  };
  for (const side of [-1, 1]) {
    for (let i = 0; i <= samples; i++) {
      const t = side === -1 ? i / samples : 1 - i / samples;
      const taper = 0.86 + 0.14 * Math.sin(Math.PI * t);
      const jitter = (random() - 0.5) * effects.roughness / 100 * Math.min(padding, width * 0.06);
      points.push([x + width / 2 + side * (half(t) * taper + jitter), y + height * t]);
    }
    // Broad top/bottom edges need their own wet contour, even for a single long line.
    const end = side === -1 ? 1 : 0;
    const capHalf = half(end) * 0.86;
    for (let i = 1; i < 14; i++) {
      const t = i / 14;
      const wave = (random() - 0.5) * effects.roughness / 100 * padding * 0.48;
      points.push([x + width / 2 + side * capHalf * (1 - 2 * t),
        y + height * end + wave * Math.sin(Math.PI * t)]);
    }
  }
  const mid = (a: number[], b: number[]) => `${((a[0] + b[0]) / 2).toFixed(2)} ${((a[1] + b[1]) / 2).toFixed(2)}`;
  return `M${mid(points[points.length - 1], points[0])} ` + points.map((p, i) =>
    `Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${mid(p, points[(i + 1) % points.length])}`).join(' ') + ' Z';
}
