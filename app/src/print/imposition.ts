import type { PrintSettings } from '../project/model';

export interface ImposedSheet {
  id: string;
  isCover?: boolean;
  front: { left: number | null; right: number | null };
  back?: { left: number | null; right: number | null };
}

export function calculateImposition(total: number, settings: PrintSettings): ImposedSheet[] {
  if (total === 0) return [];
  const sheets: ImposedSheet[] = [];

  if (settings.layout_mode === '1-up' && settings.binding_method === 'perfect') {
    for (let index = 0; index < total; index += 2) {
      sheets.push({
        id: `sheet-1up-${index / 2 + 1}`,
        isCover: false,
        front: { left: index, right: null },
        back: { left: index + 1 < total ? index + 1 : null, right: null },
      });
    }
    return sheets;
  }

  const backCoverIndex = settings.has_back_cover ? total - 1 : null;
  const innerPages: number[] = [];
  for (let index = 1; index < (settings.has_back_cover ? total - 1 : total); index += 1) {
    innerPages.push(index);
  }

  sheets.push({
    id: 'sheet-cover',
    isCover: true,
    front: { left: backCoverIndex, right: 0 },
  });

  if (innerPages.length === 0) return sheets;

  if (settings.binding_method === 'saddle') {
    while (innerPages.length % 4 !== 0) innerPages.push(-1);
    const sheetCount = innerPages.length / 4;
    for (let index = 0; index < sheetCount; index += 1) {
      const first = innerPages[innerPages.length - 1 - index * 2];
      const second = innerPages[index * 2];
      const third = innerPages[index * 2 + 1];
      const fourth = innerPages[innerPages.length - 2 - index * 2];
      sheets.push({
        id: `sheet-saddle-${index + 1}`,
        front: { left: first === -1 ? null : first, right: second === -1 ? null : second },
        back: { left: third === -1 ? null : third, right: fourth === -1 ? null : fourth },
      });
    }
  } else if (settings.binding_method === 'perfect') {
    while (innerPages.length % 4 !== 0) innerPages.push(-1);
    const half = innerPages.length / 2;
    for (let index = 0; index < innerPages.length / 4; index += 1) {
      const first = index * 2;
      const second = half + index * 2;
      sheets.push({
        id: `sheet-perfect-2up-${index + 1}`,
        front: {
          left: innerPages[first] === -1 ? null : innerPages[first],
          right: innerPages[second] === -1 ? null : innerPages[second],
        },
        back: {
          left: innerPages[first + 1] === -1 ? null : innerPages[first + 1],
          right: innerPages[second + 1] === -1 ? null : innerPages[second + 1],
        },
      });
    }
  } else {
    while (innerPages.length % 2 !== 0) innerPages.push(-1);
    for (let index = 0; index < innerPages.length / 2; index += 1) {
      const first = innerPages[index * 2];
      const second = innerPages[index * 2 + 1];
      sheets.push({
        id: `sheet-butterfly-${index + 1}`,
        front: { left: first === -1 ? null : first, right: second === -1 ? null : second },
      });
    }
  }

  return sheets;
}
