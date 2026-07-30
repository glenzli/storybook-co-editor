export interface ParsedStoryScript {
  pageText: Map<number, string>;
  author: string;
  hasTitle: boolean;
}

export interface StoryScriptIssue {
  line: number;
  tag: string;
}

const STORY_TAG_PATTERN = 'Cover|封面|Title|扉页|Author|作者|\\d+';
const STORY_TAG_GLOBAL = new RegExp(`\\[(${STORY_TAG_PATTERN})\\]`, 'gi');
const STORY_BLOCK_SPLIT = new RegExp(`(?=\\[(?:${STORY_TAG_PATTERN})\\])`, 'i');
const STORY_BLOCK = new RegExp(`\\[(${STORY_TAG_PATTERN})\\]\\s*([\\s\\S]*)`, 'i');
const VALID_STORY_TAG = new RegExp(`^\\[(${STORY_TAG_PATTERN})\\]$`, 'i');
const START_TAG = /^\[(.*?)\]/;
const TITLE_TAG = /\[(?:Title|扉页)\]/i;

export function hasStoryTitle(script: string): boolean {
  return TITLE_TAG.test(script);
}

export function parseStoryScript(script: string): ParsedStoryScript {
  const pageText = new Map<number, string>();
  let author = '';
  const hasTitle = hasStoryTitle(script);
  const blocks = script.split(STORY_BLOCK_SPLIT);

  blocks.forEach(block => {
    const match = block.match(STORY_BLOCK);
    if (!match) return;

    const key = match[1].toLowerCase();
    const text = match[2].trim();
    if (key === 'author' || key === '作者') {
      author = text;
      return;
    }

    const pageIndex = key === 'cover' || key === '封面'
      ? 0
      : key === 'title' || key === '扉页'
        ? 1
        : Number.parseInt(key, 10) + (hasTitle ? 1 : 0);

    if (Number.isFinite(pageIndex)) pageText.set(pageIndex, text);
  });

  return { pageText, author, hasTitle };
}

export function getStoryPageIndexAtOffset(script: string, offset: number): number | null {
  const textBeforeCursor = script.slice(0, offset);
  const matches = [...textBeforeCursor.matchAll(STORY_TAG_GLOBAL)];
  if (matches.length === 0) return null;

  const key = matches[matches.length - 1][1].toLowerCase();
  if (key === 'cover' || key === '封面') return 0;
  if (key === 'title' || key === '扉页') return 1;
  if (key === 'author' || key === '作者') return null;
  return Number.parseInt(key, 10) + (hasStoryTitle(script) ? 1 : 0);
}

export function validateStoryScript(script: string): StoryScriptIssue[] {
  const issues: StoryScriptIssue[] = [];
  script.split('\n').forEach((line, index) => {
    const match = START_TAG.exec(line.trim());
    if (match && !VALID_STORY_TAG.test(match[0])) {
      issues.push({ line: index + 1, tag: match[0] });
    }
  });
  return issues;
}
