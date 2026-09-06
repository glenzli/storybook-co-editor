import { describe, expect, it } from 'vitest';
import {
  BUNDLED_FONT_FAMILIES,
  getAvailableFontWeights,
  getFontFamilyStack,
  normalizeFontWeight,
} from './fonts';

describe('bundled storybook fonts', () => {
  it('registers the lighter body-font choices and their fallback stacks', () => {
    expect(BUNDLED_FONT_FAMILIES).toContain('Yozai');
    expect(BUNDLED_FONT_FAMILIES).toContain('Xiaolai');
    expect(getFontFamilyStack('Yozai')).toContain('"Yozai"');
    expect(getFontFamilyStack('Xiaolai')).toContain('"Xiaolai"');
  });

  it('exposes only weights backed by bundled font files', () => {
    expect(getAvailableFontWeights('LXGW WenKai')).toEqual([300, 400]);
    expect(getAvailableFontWeights('Yozai')).toEqual([300, 400]);
    expect(getAvailableFontWeights('Xiaolai')).toEqual([400]);
    expect(normalizeFontWeight('Yozai', 700)).toBe(400);
    expect(normalizeFontWeight('LXGW WenKai', 300)).toBe(300);
  });
});
