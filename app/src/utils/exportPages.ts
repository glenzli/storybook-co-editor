import type { ProjectState } from '../project/model';
import {
  buildPublicationPage,
  renderPublicationPageToCanvas,
  shouldIncludeCopyrightPage,
  type PublicationPage,
  type PublicationPageTarget,
} from './publicationPageRenderer';
import {
  buildStoryPages,
  renderStoryPageToCanvas,
  type StoryPage,
} from './storyPageRenderer';
import { parseStoryScript } from '../story/script';

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
  const storyPages = buildStoryPages(projectState, imageSources);
  const pages: UnindexedExportPage[] = storyPages.map(story => ({
    kind: 'story',
    width: story.width,
    height: story.height,
    story,
  }));

  if (shouldIncludeCopyrightPage(projectState, target)) {
    const publication = buildPublicationPage(projectState);
    const parsed = parseStoryScript(projectState.global_script || '');
    const insertAt = parsed.hasTitle && storyPages[1]?.role === 'title'
      ? 2
      : Math.min(1, storyPages.length);
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
