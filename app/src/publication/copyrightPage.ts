import type { ProjectState, PublicationContributor } from '../project/model';
import i18n, { getPublicationLanguage } from '../i18n';
import { getFontFamilyStack, getPublicationFontFamily } from '../utils/fonts';
import { hasPublicationMetadata } from '../utils/publicationMetadata';

export type PublicationPageTarget = 'electronic' | 'print';

export interface PublicationPageEntry {
  label: string;
  value: string;
}

export interface PublicationPage {
  width: number;
  height: number;
  fontFamily: string;
  heading: string;
  remainingMetadata: string;
  title: string;
  contributors: PublicationPageEntry[];
  details: PublicationPageEntry[];
  rights: string[];
}

export function copyrightPageInsertionIndex(pages: Array<{ role: string }>): number {
  return pages[1]?.role === 'title' ? 2 : Math.min(1, pages.length);
}

function trimmed(value: string | undefined): string {
  return value?.trim() || '';
}

export function shouldIncludeCopyrightPage(
  projectState: ProjectState,
  target: PublicationPageTarget,
): boolean {
  const metadata = projectState.publication_metadata;
  if (!hasPublicationMetadata(metadata)) return false;
  const mode = metadata?.copyright_page_mode ?? 'electronic';
  return target === 'electronic' ? mode !== 'none' : mode === 'all';
}

export function buildPublicationPage(projectState: ProjectState): PublicationPage {
  const metadata = projectState.publication_metadata;
  const language = getPublicationLanguage(metadata?.language);
  const t = i18n.getFixedT(language);
  const contributorGroups = new Map<PublicationContributor['role'], string[]>();

  metadata?.contributors?.forEach(contributor => {
    const name = trimmed(contributor.name);
    if (!name) return;
    const names = contributorGroups.get(contributor.role) || [];
    names.push(name);
    contributorGroups.set(contributor.role, names);
  });

  const contributors = [...contributorGroups.entries()].map(([role, names]) => ({
    label: t(`publication.roles.${role === 'other' ? 'contributor' : role}`),
    value: names.join(language === 'zh-CN' ? '、' : ', '),
  }));
  const details: PublicationPageEntry[] = [];

  if (trimmed(metadata?.publisher)) details.push({ label: t('publication.fields.publisher'), value: trimmed(metadata?.publisher) });
  if (trimmed(metadata?.publication_date)) details.push({ label: t('publication.fields.publicationDate'), value: trimmed(metadata?.publication_date) });
  if (trimmed(metadata?.language)) details.push({ label: t('publication.fields.language'), value: trimmed(metadata?.language) });
  const identifiers = metadata?.identifiers?.filter(identifier => trimmed(identifier.value)) ?? [];
  identifiers.slice(0, 6).forEach(identifier => {
    const value = trimmed(identifier.value);
    if (value) details.push({ label: identifier.scheme === 'CUSTOM' ? t('publication.identifier') : identifier.scheme, value });
  });
  if (identifiers.length > 6) {
    details.push({
      label: t('publication.roles.other'),
      value: t('publication.additionalIdentifiers', { count: identifiers.length - 6 }),
    });
  }

  const derivedCopyright = trimmed(metadata?.copyright_holder) || trimmed(metadata?.copyright_year)
    ? `© ${[trimmed(metadata?.copyright_year), trimmed(metadata?.copyright_holder)].filter(Boolean).join(' ')}`
    : '';
  const rights = [
    trimmed(metadata?.copyright_notice) || derivedCopyright,
    trimmed(metadata?.license_name),
    trimmed(metadata?.license_url),
  ].filter(Boolean);

  return {
    width: projectState.canvas_width || 1024,
    height: projectState.canvas_height || 1024,
    fontFamily: getPublicationFontFamily(projectState),
    heading: t('publication.pageHeading'),
    remainingMetadata: t('publication.remainingMetadata'),
    title: trimmed(metadata?.title) || projectState.project_name,
    contributors,
    details,
    rights,
  };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];

  text.split('\n').forEach(paragraph => {
    if (!paragraph) {
      lines.push('');
      return;
    }

    let line = '';
    for (const char of paragraph) {
      const candidate = line + char;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  });

  return lines;
}

export interface PublicationSeparator {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface PublicationTextBlock {
  text: string;
  lines: Array<{ text: string; x: number; y: number }>;
  maxWidth: number;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  color: string;
  separator?: PublicationSeparator;
}

// PDF and web publication consume the same measured, top-aligned text blocks.
export function layoutPublicationPage(ctx: CanvasRenderingContext2D, page: PublicationPage): PublicationTextBlock[] {
  const blocks: PublicationTextBlock[] = [];
  const scale = Math.max(page.width, page.height) / 1024;
  const marginX = Math.max(48 * scale, page.width * 0.085);
  const maxWidth = page.width - marginX * 2;
  const contentRows = page.contributors.length + page.details.length + page.rights.length * 2;
  const bodyFontSize = Math.max(11 * scale, Math.min(14 * scale, page.height * 0.42 / Math.max(contentRows, 12)));
  const bodyLineHeight = bodyFontSize * 1.45;
  const titleFontSize = Math.min(22 * scale, bodyFontSize * 1.5);
  const headingFontSize = Math.max(9 * scale, bodyFontSize * 0.78);
  const smallFontSize = Math.max(8 * scale, bodyFontSize * 0.68);
  const fontFamily = getFontFamilyStack(page.fontFamily);
  const footerY = page.height - page.height * 0.07;
  const contentBottom = footerY - bodyLineHeight * 1.8;
  let separator: PublicationSeparator | undefined;
  const measure = (text: string, width: number, size: number, weight: number) => {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    return wrapText(ctx, text, width);
  };
  const addText = (text: string, x: number, y: number, width: number, size: number,
    weight: number, color: string, lineHeight = bodyLineHeight, maxLines = 1) => {
    const lines = measure(text, width, size, weight).slice(0, maxLines);
    blocks.push({ text, lines: lines.map((line, index) => ({ text: line, x, y: y + index * lineHeight })),
      maxWidth: width, fontSize: size, fontWeight: weight, color, lineHeight, separator });
    separator = undefined;
    return y + lines.length * lineHeight;
  };

  let y = page.height * 0.1;
  addText(page.heading, marginX, y, maxWidth, headingFontSize, 500, '#555555');
  y += bodyLineHeight * 1.35;
  y = addText(page.title, marginX, y, maxWidth, titleFontSize, 600, '#111111', titleFontSize * 1.22, 3);
  y += bodyLineHeight;
  separator = { x: marginX, y, width: maxWidth, height: Math.max(1, scale * 0.75), color: '#b8b8b8' };
  y += bodyLineHeight * 1.1;
  const labelWidth = Math.min(maxWidth * 0.25, 150 * scale);
  let wasTruncated = false;
  for (const entry of [...page.contributors, ...page.details]) {
    const count = Math.min(2, measure(entry.value, maxWidth - labelWidth, bodyFontSize, 400).length);
    if (y + Math.max(1, count) * bodyLineHeight > contentBottom) { wasTruncated = true; break; }
    addText(entry.label, marginX, y, labelWidth, bodyFontSize, 400, '#5a5a5a');
    const nextY = addText(entry.value, marginX + labelWidth, y, maxWidth - labelWidth,
      bodyFontSize, 400, '#111111', bodyLineHeight, 2);
    y = Math.max(y + bodyLineHeight, nextY);
  }
  if (!wasTruncated && page.rights.length > 0 && y + bodyLineHeight * 2.65 > contentBottom) wasTruncated = true;
  if (!wasTruncated && page.rights.length > 0) {
    y += bodyLineHeight * 0.65;
    separator = { x: marginX, y, width: maxWidth, height: Math.max(1, scale), color: '#c8c8c8' };
    y += bodyLineHeight;
    for (const [index, right] of page.rights.entries()) {
      const weight = index === 0 ? 600 : 400;
      const count = Math.min(4, measure(right, maxWidth, bodyFontSize, weight).length);
      if (y + Math.max(1, count) * bodyLineHeight > contentBottom) { wasTruncated = true; break; }
      y = addText(right, marginX, y, maxWidth, bodyFontSize, weight,
        index === 0 ? '#111111' : '#444444', bodyLineHeight, 4);
      y += bodyLineHeight * 0.35;
    }
  }
  if (wasTruncated) addText(page.remainingMetadata, marginX, Math.min(y, contentBottom), maxWidth, smallFontSize, 400, '#777777');
  addText('Storybook Co-Editor', marginX, footerY, maxWidth, smallFontSize, 400, '#666666');
  return blocks;
}

export function renderPublicationPageToCanvas(page: PublicationPage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(i18n.t('errors.canvasUnavailable'));
  const blocks = layoutPublicationPage(ctx, page);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (const block of blocks) {
    if (block.separator) {
      const rect = block.separator;
      ctx.fillStyle = rect.color;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
    ctx.fillStyle = block.color;
    ctx.font = `${block.fontWeight} ${block.fontSize}px ${getFontFamilyStack(page.fontFamily)}`;
    for (const line of block.lines) ctx.fillText(line.text, line.x, line.y);
  }
  return canvas;
}
