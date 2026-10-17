import { describe, expect, it, vi } from 'vitest';
import { createPigmentWash, drawPigmentWash } from './pigment';
import { createAdaptiveWashPath, effectsFromMode } from './effects';

const effects = effectsFromMode('wash', 55);
const geometry = { x: 10, y: 20, width: 300, height: 90, paddingX: 20, feather: 3,
  path: createAdaptiveWashPath(10, 20, 300, 90, [260, 120], 20, effects) };
describe('pigment rendering contract', () => {
  it('reproduces persisted paint and varies seed without changing frozen text geometry', () => {
    const passes = createPigmentWash(geometry, effects);
    expect(passes).toEqual(createPigmentWash(geometry, JSON.parse(JSON.stringify(effects))));
    expect(passes).not.toEqual(createPigmentWash(geometry, { ...effects, seed: 2 }));
    expect(passes[0].path).toBe(geometry.path);
    // All unclipped coats use the one paragraph contour; no shifted translucent slabs.
    expect(new Set(passes.filter(pass => !pass.clip).map(pass => pass.path))).toEqual(new Set([geometry.path]));
    expect(passes.filter(pass => !pass.clip).every(pass => pass.blur >= geometry.feather)).toBe(true);
    expect(passes.filter(pass => pass.clip).every(pass => pass.opacity < 0.1)).toBe(true);
    expect(passes.length).toBeLessThan(30);
    for (const pass of passes) {
      expect(pass.path).not.toMatch(/NaN|Infinity/);
      expect(pass.opacity).toBeGreaterThan(0);
      expect(pass.opacity).toBeLessThan(1);
      expect(pass.blur).toBeGreaterThanOrEqual(0);
    }
  });
  it('clips edge pigment and restores canvas state for every shared SVG paint pass', () => {
    const passes = createPigmentWash(geometry, effects);
    vi.stubGlobal('Path2D', class { constructor(public path: string) {} });
    try {
      const ctx = { save: vi.fn(), restore: vi.fn(), clip: vi.fn(), fill: vi.fn(), stroke: vi.fn(), globalAlpha: 1 };
      drawPigmentWash(ctx as unknown as CanvasRenderingContext2D, geometry.path, '#abc', passes);
      expect(ctx.save).toHaveBeenCalledTimes(passes.length);
      expect(ctx.restore).toHaveBeenCalledTimes(passes.length);
      expect(ctx.clip).toHaveBeenCalledTimes(passes.filter(p => p.clip).length);
      expect(ctx.stroke).toHaveBeenCalledTimes(1);
      expect(ctx.fill).toHaveBeenCalledTimes(passes.length - 1);
    } finally { vi.unstubAllGlobals(); }
  });
});
