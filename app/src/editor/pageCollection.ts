import type { ImageAdjustments, PageSettings, ProjectState } from '../project/model';

export type PageIndexMapping = (oldIndex: number) => number | null;

export function remapMovedIndex(index: number, from: number, to: number): number {
  if (index === from) return to;
  if (from < to && index > from && index <= to) return index - 1;
  if (from > to && index >= to && index < from) return index + 1;
  return index;
}

export function createMoveMapping(from: number, to: number): PageIndexMapping {
  return index => remapMovedIndex(index, from, to);
}

export function remapPageIndexedState(
  projectState: ProjectState,
  itemCount: number,
  mapping: PageIndexMapping,
): Pick<ProjectState, 'image_adjustments' | 'page_text_overrides' | 'page_settings'> {
  const imageAdjustments: Record<string, ImageAdjustments> = {};
  const pageTextOverrides: NonNullable<ProjectState['page_text_overrides']> = {};
  const pageSettings: Record<string, PageSettings> = {};

  for (let oldIndex = 0; oldIndex < itemCount; oldIndex += 1) {
    const newIndex = mapping(oldIndex);
    if (newIndex === null) continue;
    const oldKey = String(oldIndex);
    const newKey = String(newIndex);
    if (projectState.image_adjustments?.[oldKey]) {
      imageAdjustments[newKey] = projectState.image_adjustments[oldKey];
    }
    if (projectState.page_text_overrides?.[oldKey]) {
      pageTextOverrides[newKey] = projectState.page_text_overrides[oldKey];
    }
    if (projectState.page_settings?.[oldKey]) {
      pageSettings[newKey] = projectState.page_settings[oldKey];
    }
  }

  return {
    image_adjustments: imageAdjustments,
    page_text_overrides: pageTextOverrides,
    page_settings: pageSettings,
  };
}
