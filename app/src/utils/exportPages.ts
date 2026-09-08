import type { ProjectState } from '../project/model';
import {
  buildPublicationPage,
  copyrightPageInsertionIndex,
  renderPublicationPageToCanvas,
  shouldIncludeCopyrightPage,
  type PublicationPage,
  type PublicationPageTarget,
} from '../publication/copyrightPage';
import {
  buildStoryPages,
  renderStoryPageToCanvas,
  type StoryPage,
} from './storyPageRenderer';
import { isPagePrintOnly } from '../project/pageSettings';

export type ExportPage =
  | { kind: 'story'; exportIndex: number; width: number; height: number; story: StoryPage }
  | { kind: 'copyright'; exportIndex: number; width: number; height: number; publication: PublicationPage };

type UnindexedExportPage =
  | Omit<Extract<ExportPage, { kind: 'story' }>, 'exportIndex'>
  | Omit<Extract<ExportPage, { kind: 'copyright' }>, 'exportIndex'>;

export function buildExportPages(
  projectState: ProjectState,
  imageSources: string[] | undefined,
  target: PublicationPageTarget,
): ExportPage[] {
  const storyPages = buildStoryPages(projectState, imageSources).filter(
    story => target === 'print' || !isPagePrintOnly(projectState, story.index),
  );
  const pages: UnindexedExportPage[] = storyPages.map(story => ({
    kind: 'story',
    width: story.width,
    height: story.height,
    story,
  }));

  if (shouldIncludeCopyrightPage(projectState, target)) {
    const publication = buildPublicationPage(projectState);
    const insertAt = copyrightPageInsertionIndex(storyPages);
    pages.splice(insertAt, 0, {
      kind: 'copyright',
      width: publication.width,
      height: publication.height,
      publication,
    });
  }

  return pages.map((page, exportIndex) => ({ ...page, exportIndex } as ExportPage));
}

export function renderExportPageToCanvas(page: ExportPage): Promise<HTMLCanvasElement> {
  if (page.kind === 'story') return renderStoryPageToCanvas(page.story);
  return Promise.resolve(renderPublicationPageToCanvas(page.publication));
}
