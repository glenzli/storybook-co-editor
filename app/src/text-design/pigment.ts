import type { TextEffects } from '../project/model';
import { createAdaptiveWashPath, normalizeEffects } from './effects';

/** Frozen paint passes shared by SVG previews and Canvas/PDF rendering. */
export interface PigmentPass {
  path: string;
  opacity: number;
  blur: number;
  clip: boolean;
  strokeWidth?: number;
}
interface WashGeometry {
  x: number; y: number; width: number; height: number;
  paddingX: number; feather: number; path: string | null;
}

export function createPigmentWash(wash: WashGeometry, widths: number[], raw: TextEffects): PigmentPass[] {
  if (!wash.path || wash.width <= 0 || wash.height <= 0) return [];
  const effects = normalizeEffects(raw);
  let seed = effects.seed >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const { x, y, width: w, height: h } = wash;
  const unit = Math.min(h, wash.paddingX * 3);
  const rough = effects.roughness / 100;
  const passes: PigmentPass[] = [{ path: wash.path, opacity: 0.66, blur: wash.feather, clip: false }];
  // Translucent glazes have independent wet edges, without thinning the readable body.
  for (let i = 0; i < 3; i++) {
    const dx = (random() - 0.5) * unit * 0.13;
    const dy = (random() - 0.5) * unit * 0.09;
    passes.push({ path: createAdaptiveWashPath(x + dx, y + dy, w, h, widths,
      wash.paddingX, { ...effects, seed: Math.floor(random() * 4294967296) }),
      opacity: 0.13, blur: wash.feather * (0.55 + random()), clip: false });
  }
  const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
    `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
  // Broad pools concentrate at the perimeter; no high-contrast noise underneath glyphs.
  for (let i = 0; i < 16; i++) {
    const cx = x + random() * w;
    const cy = y + (i % 2 ? 0.91 : 0.09) * h + (random() - 0.5) * h * 0.18;
    passes.push({ path: ellipse(cx, cy, w * (0.035 + random() * 0.1), h * (0.12 + random() * 0.18)),
      opacity: (0.1 + random() * 0.18) * (0.5 + rough * 0.5), blur: unit * 0.09, clip: true });
  }
  // Broken edge accumulation is softly clipped; it must never look like an outline.
  passes.push({ path: wash.path, opacity: 0.16 + rough * 0.08,
    blur: Math.max(wash.feather * 0.6, unit * 0.025), clip: true, strokeWidth: unit * 0.055 });
  let grains = '';
  for (let i = 0; i < 320; i++) {
    const cx = x + random() * w, t = random();
    const cy = y + t * h;
    if (t > 0.22 && t < 0.78 && random() < 0.82) continue;
    const radius = unit * (0.003 + random() * 0.007);
    grains += ellipse(cx, cy, radius, radius * 0.65);
  }
  passes.push({ path: grains, opacity: 0.055 + rough * 0.04, blur: unit * 0.003, clip: true });
  return passes;
}

export function drawPigmentWash(ctx: CanvasRenderingContext2D, path: string, color: string, passes: PigmentPass[]): void {
  for (const pass of passes) {
    ctx.save();
    if (pass.clip) ctx.clip(new Path2D(path));
    ctx.globalAlpha *= pass.opacity;
    ctx.filter = `blur(${pass.blur}px)`;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (pass.strokeWidth) {
      ctx.lineWidth = pass.strokeWidth;
      ctx.stroke(new Path2D(pass.path));
    } else ctx.fill(new Path2D(pass.path));
    ctx.restore();
  }
}
