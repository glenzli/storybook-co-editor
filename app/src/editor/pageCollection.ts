import type { ImageAdjustments, PageSettings, ProjectLanguage, ProjectState } from '../project/model';

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
): Partial<Pick<ProjectState, 'image_adjustments' | 'page_text_overrides' | 'page_settings' | 'languages'>> {
  const imageAdjustments: Record<string, ImageAdjustments> = {};
  const pageSettings: Record<string, PageSettings> = {};

  const remapTextOverrides = (
    overrides: ProjectLanguage['page_text_overrides'] | ProjectState['page_text_overrides'],
  ): NonNullable<ProjectLanguage['page_text_overrides']> => {
    const result: NonNullable<ProjectLanguage['page_text_overrides']> = {};
    for (let oldIndex = 0; oldIndex < itemCount; oldIndex += 1) {
      const newIndex = mapping(oldIndex);
      if (newIndex === null) continue;
      const value = overrides?.[String(oldIndex)];
      if (value) result[String(newIndex)] = value;
    }
    return result;
  };

  for (let oldIndex = 0; oldIndex < itemCount; oldIndex += 1) {
    const newIndex = mapping(oldIndex);
    if (newIndex === null) continue;
    const oldKey = String(oldIndex);
    const newKey = String(newIndex);
    if (projectState.image_adjustments?.[oldKey]) {
      imageAdjustments[newKey] = projectState.image_adjustments[oldKey];
    }
    if (projectState.page_settings?.[oldKey]) {
      pageSettings[newKey] = projectState.page_settings[oldKey];
    }
  }

  const result: Partial<Pick<ProjectState, 'image_adjustments' | 'page_text_overrides' | 'page_settings' | 'languages'>> = {
    image_adjustments: imageAdjustments,
    page_settings: pageSettings,
  };

  if (projectState.languages) {
    result.languages = Object.fromEntries(Object.entries(projectState.languages).map(([language, content]) => [
      language,
      { ...content, page_text_overrides: remapTextOverrides(content.page_text_overrides) },
    ]));
  }
  if (projectState.page_text_overrides) {
    result.page_text_overrides = remapTextOverrides(projectState.page_text_overrides);
  }

  return result;
}
