import type { ProjectState, PublicationContributor } from '../ProjectContext';
import { hasPublicationMetadata } from './publicationMetadata';

export type PublicationPageTarget = 'electronic' | 'print';

export interface PublicationPageEntry {
  label: string;
  value: string;
}

export interface PublicationPage {
  width: number;
  height: number;
  title: string;
  contributors: PublicationPageEntry[];
  details: PublicationPageEntry[];
  rights: string[];
}

const ROLE_LABELS: Record<PublicationContributor['role'], string> = {
  author: '作者',
  illustrator: '绘者',
  editor: '编辑',
  translator: '译者',
  other: '参与者',
};

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
  const contributorGroups = new Map<PublicationContributor['role'], string[]>();

  metadata?.contributors?.forEach(contributor => {
    const name = trimmed(contributor.name);
    if (!name) return;
    const names = contributorGroups.get(contributor.role) || [];
    names.push(name);
    contributorGroups.set(contributor.role, names);
  });

  const contributors = [...contributorGroups.entries()].map(([role, names]) => ({
    label: ROLE_LABELS[role],
    value: names.join('、'),
  }));
  const details: PublicationPageEntry[] = [];

  if (trimmed(metadata?.publisher)) details.push({ label: '出版者', value: trimmed(metadata?.publisher) });
  if (trimmed(metadata?.publication_date)) details.push({ label: '发布日期', value: trimmed(metadata?.publication_date) });
  if (trimmed(metadata?.language)) details.push({ label: '语言', value: trimmed(metadata?.language) });
  const identifiers = metadata?.identifiers?.filter(identifier => trimmed(identifier.value)) ?? [];
  identifiers.slice(0, 6).forEach(identifier => {
    const value = trimmed(identifier.value);
    if (value) details.push({ label: identifier.scheme === 'CUSTOM' ? '标识符' : identifier.scheme, value });
  });
  if (identifiers.length > 6) {
    details.push({ label: '其他', value: `另有 ${identifiers.length - 6} 项标识符已写入 PDF metadata` });
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

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines?: number,
): number {
  const lines = wrapText(ctx, text, maxWidth);
  const visibleLines = maxLines ? lines.slice(0, maxLines) : lines;
  visibleLines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + visibleLines.length * lineHeight;
}

export function renderPublicationPageToCanvas(page: PublicationPage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');

  const scale = Math.min(page.width, page.height) / 1024;
  const marginX = Math.max(48 * scale, page.width * 0.085);
  const maxWidth = page.width - marginX * 2;
  const contentRows = page.contributors.length + page.details.length + page.rights.length * 2;
  const bodyFontSize = Math.max(14 * scale, Math.min(22 * scale, page.height * 0.48 / Math.max(contentRows, 9)));
  const bodyLineHeight = bodyFontSize * 1.55;
  const titleFontSize = Math.max(30 * scale, Math.min(52 * scale, bodyFontSize * 2.25));
  const footerY = page.height - page.height * 0.07;
  const contentBottom = footerY - bodyLineHeight * 1.8;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let y = page.height * 0.09;
  ctx.fillStyle = '#147d75';
  ctx.font = `600 ${Math.max(13 * scale, bodyFontSize * 0.7)}px sans-serif`;
  ctx.fillText('出版与版权', marginX, y);
  y += bodyLineHeight * 1.2;

  ctx.fillStyle = '#171717';
  ctx.font = `600 ${titleFontSize}px sans-serif`;
  y = drawWrappedText(ctx, page.title, marginX, y, maxWidth, titleFontSize * 1.22, 3);
  y += bodyLineHeight * 0.9;

  ctx.fillStyle = '#147d75';
  ctx.fillRect(marginX, y, Math.min(maxWidth, 120 * scale), Math.max(2, 3 * scale));
  y += bodyLineHeight * 1.2;

  const entries = [...page.contributors, ...page.details];
  const labelWidth = Math.min(maxWidth * 0.25, 150 * scale);
  ctx.font = `${bodyFontSize}px sans-serif`;
  let wasTruncated = false;

  for (const entry of entries) {
    const entryLineCount = Math.min(
      2,
      wrapText(ctx, entry.value, maxWidth - labelWidth).length,
    );
    if (y + Math.max(1, entryLineCount) * bodyLineHeight > contentBottom) {
      wasTruncated = true;
      break;
    }
    ctx.fillStyle = '#686868';
    ctx.fillText(entry.label, marginX, y);
    ctx.fillStyle = '#202020';
    const nextY = drawWrappedText(
      ctx,
      entry.value,
      marginX + labelWidth,
      y,
      maxWidth - labelWidth,
      bodyLineHeight,
      2,
    );
    y = Math.max(y + bodyLineHeight, nextY);
  }

  if (!wasTruncated && page.rights.length > 0) {
    if (y + bodyLineHeight * 2.65 > contentBottom) {
      wasTruncated = true;
    }
  }

  if (!wasTruncated && page.rights.length > 0) {
    y += bodyLineHeight * 0.65;
    ctx.fillStyle = '#d9d9d9';
    ctx.fillRect(marginX, y, maxWidth, Math.max(1, scale));
    y += bodyLineHeight;

    for (let index = 0; index < page.rights.length; index += 1) {
      const right = page.rights[index];
      ctx.font = `${index === 0 ? 600 : 400} ${bodyFontSize}px sans-serif`;
      const rightLineCount = Math.min(4, wrapText(ctx, right, maxWidth).length);
      if (y + Math.max(1, rightLineCount) * bodyLineHeight > contentBottom) {
        wasTruncated = true;
        break;
      }
      ctx.fillStyle = index === 0 ? '#202020' : '#555555';
      y = drawWrappedText(ctx, right, marginX, y, maxWidth, bodyLineHeight, 4);
      y += bodyLineHeight * 0.35;
    }
  }

  if (wasTruncated) {
    ctx.fillStyle = '#777777';
    ctx.font = `${Math.max(11 * scale, bodyFontSize * 0.62)}px sans-serif`;
    ctx.fillText('其余出版信息已写入 PDF metadata', marginX, Math.min(y, contentBottom));
  }

  ctx.fillStyle = '#777777';
  ctx.font = `${Math.max(11 * scale, bodyFontSize * 0.62)}px sans-serif`;
  ctx.fillText('Storybook Co-Editor', marginX, footerY);

  return canvas;
}
