import type { ProjectState, TextSettings } from '../ProjectContext';

export const BUNDLED_FONT_FAMILIES = [
  'LXGW WenKai',
  'Smiley Sans',
  'ZCOOL QingKe HuangYou',
  'ZCOOL XiaoWei',
  'ZCOOL KuaiLe',
  'Noto Serif SC',
  'Noto Sans SC',
] as const;

export const BUILT_IN_FONT_OPTIONS = [
  { value: 'serif', label: '系统衬线体 (Serif)' },
  { value: 'sans', label: '系统无衬线体 (Sans)' },
  { value: 'LXGW WenKai', label: '霞鹜文楷 (清爽手写)' },
  { value: 'Smiley Sans', label: '得意黑 (灵活标题)' },
  { value: 'ZCOOL QingKe HuangYou', label: '站酷庆科黄油体 (方正标题)' },
  { value: 'ZCOOL XiaoWei', label: '站酷小薇体 (秀雅标题)' },
  { value: 'ZCOOL KuaiLe', label: '站酷快乐体 (卡通粗体)' },
  { value: 'Noto Serif SC', label: '思源宋体 (端庄)' },
  { value: 'Noto Sans SC', label: '思源黑体 (现代)' },
] as const;

const quoteFontFamily = (family: string) => `"${family.replace(/"/g, '\\"')}"`;

export function getFontFamilyStack(fontFamily?: string): string {
  const ff = fontFamily || 'serif';

  if (ff === 'sans') {
    return '"Noto Sans SC", "PingFang SC", "Helvetica Neue", Arial, sans-serif';
  }

  if (ff === 'serif') {
    return '"Noto Serif SC", "Songti SC", Georgia, serif';
  }

  if (ff === 'LXGW WenKai') {
    return '"LXGW WenKai", "Noto Serif SC", "Songti SC", serif';
  }

  if (ff === 'Smiley Sans') {
    return '"Smiley Sans", "Noto Sans SC", "PingFang SC", sans-serif';
  }

  if (ff === 'ZCOOL QingKe HuangYou') {
    return '"ZCOOL QingKe HuangYou", "Noto Sans SC", "PingFang SC", sans-serif';
  }

  if (ff === 'ZCOOL XiaoWei') {
    return '"ZCOOL XiaoWei", "Noto Serif SC", "Songti SC", serif';
  }

  if (ff === 'ZCOOL KuaiLe') {
    return '"ZCOOL KuaiLe", "Noto Sans SC", "PingFang SC", sans-serif';
  }

  if (ff === 'Noto Serif SC') {
    return '"Noto Serif SC", "Songti SC", Georgia, serif';
  }

  if (ff === 'Noto Sans SC') {
    return '"Noto Sans SC", "PingFang SC", "Helvetica Neue", Arial, sans-serif';
  }

  return `${quoteFontFamily(ff)}, "Noto Sans SC", "PingFang SC", "Helvetica Neue", Arial, sans-serif`;
}

function getBundledFontWeights(fontFamily: string): number[] {
  if (fontFamily === 'Noto Sans SC' || fontFamily === 'Noto Serif SC') {
    return [400, 700];
  }

  return [400];
}

function getPrimaryLoadFamily(fontFamily?: string): string {
  const ff = fontFamily || 'serif';
  if (ff === 'sans') return 'Noto Sans SC';
  if (ff === 'serif') return 'Noto Serif SC';
  return ff;
}

function collectSettingFamilies(projectState: ProjectState | null | undefined): string[] {
  const settings: Array<TextSettings | undefined> = [
    projectState?.cover_text_settings,
    projectState?.title_text_settings,
    projectState?.inner_text_settings,
    projectState?.author_text_settings,
  ];

  return [...new Set(settings.map(s => s?.font_family || 'serif'))];
}

export async function waitForProjectFonts(projectState: ProjectState | null | undefined): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;

  const fontSet = document.fonts;
  const families = collectSettingFamilies(projectState);
  const loadFamilies = new Set<string>();

  families.forEach(family => {
    const primary = getPrimaryLoadFamily(family);
    if (primary === 'serif' || primary === 'sans') return;
    loadFamilies.add(primary);
  });

  // Generic aliases now resolve to bundled Noto fonts, so preload them when present.
  if (families.includes('serif')) loadFamilies.add('Noto Serif SC');
  if (families.includes('sans')) loadFamilies.add('Noto Sans SC');

  const loads = [...loadFamilies].flatMap(family => {
    const quoted = quoteFontFamily(family);
    return getBundledFontWeights(family).map(weight => fontSet.load(`${weight} 32px ${quoted}`));
  });

  await Promise.allSettled(loads);
  await fontSet.ready;
}
