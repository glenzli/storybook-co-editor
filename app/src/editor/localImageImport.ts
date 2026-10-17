import type { ProjectState } from '../project/model';
import { remapPageIndexedState } from './pageCollection';

export interface ImportedImage {
  filename: string;
  width: number;
  height: number;
  status: 'new' | 'duplicate' | 'trashed';
}

export interface ImageImportResult {
  images: ImportedImage[];
  failures: { name: string; error: string }[];
}

export function planImageImport(
  state: ProjectState,
  images: ImportedImage[],
  afterIndex: number | null,
) {
  const visible = new Set(state.visible_images);
  const trash = new Set(state.trashed_images);
  const added: ImportedImage[] = [];
  let duplicates = 0;
  let trashed = 0;
  for (const image of images) {
    if (image.status === 'trashed' || trash.has(image.filename)) {
      trashed += 1;
    } else if (visible.has(image.filename)) {
      duplicates += 1;
    } else {
      visible.add(image.filename);
      added.push(image);
    }
  }
  const insertionIndex = afterIndex === null
    ? state.visible_images.length
    : Math.max(0, Math.min(state.visible_images.length, afterIndex + 1));
  const nextImages = [...state.visible_images];
  nextImages.splice(insertionIndex, 0, ...added.map(image => image.filename));
  const updates: Partial<ProjectState> = added.length === 0 ? {} : {
    ...remapPageIndexedState(state, state.visible_images.length, index => (
      index >= insertionIndex ? index + added.length : index
    )),
    visible_images: nextImages,
  };
  if (added.length > 0 && state.visible_images.length === 0
      && state.canvas_width === 1024 && state.canvas_height === 1024) {
    updates.canvas_width = added[0].width;
    updates.canvas_height = added[0].height;
  }
  return {
    updates,
    added: added.length,
    duplicates,
    trashed,
    selectedIndex: added.length > 0 ? insertionIndex : null,
  };
}
