import { describe, expect, it } from 'vitest';
import {
  getStoryPageIndexAtOffset,
  hasStoryTitle,
  parseStoryScript,
  validateStoryScript,
} from './script';

describe('story script', () => {
  it('parses bilingual tags into stable page indexes', () => {
    const script = '[封面]\n标题\n\n[扉页]\n副标题\n\n[作者]\n作者名\n\n[1]\n正文';
    const parsed = parseStoryScript(script);

    expect(parsed.hasTitle).toBe(true);
    expect(parsed.author).toBe('作者名');
    expect(parsed.pageText.get(0)).toBe('标题');
    expect(parsed.pageText.get(1)).toBe('副标题');
    expect(parsed.pageText.get(2)).toBe('正文');
  });

  it('maps the cursor to the active story page', () => {
    const script = '[Cover]\nCover\n\n[Title]\nTitle\n\n[2]\nBody';
    expect(getStoryPageIndexAtOffset(script, script.length)).toBe(3);
    expect(hasStoryTitle(script)).toBe(true);
  });

  it('reports unknown bracket tags without rejecting regular text', () => {
    expect(validateStoryScript('[Cover]\nText\n[Unknown]\nMore')).toEqual([
      { line: 3, tag: '[Unknown]' },
    ]);
  });
});
