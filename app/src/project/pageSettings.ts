import type { PageSettings, ProjectState } from './model';

export function isPagePrintOnly(projectState: ProjectState, pageIndex: number): boolean {
  return projectState.page_settings?.[String(pageIndex)]?.print_only === true;
}

export function setPagePrintOnly(
  pageSettings: ProjectState['page_settings'],
  pageIndex: number,
  printOnly: boolean,
): Record<string, PageSettings> {
  const next = { ...(pageSettings || {}) };
  const key = String(pageIndex);

  if (printOnly) {
    next[key] = { ...next[key], print_only: true };
  } else {
    const current = { ...next[key] };
    delete current.print_only;
    if (Object.keys(current).length === 0) delete next[key];
    else next[key] = current;
  }

  return next;
}

export function getElectronicStoryPageCount(projectState: ProjectState): number {
  return projectState.visible_images.reduce(
    (count, _source, index) => count + (isPagePrintOnly(projectState, index) ? 0 : 1),
    0,
  );
}
