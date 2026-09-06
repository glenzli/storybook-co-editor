import type { ProjectState } from './model';

/** Saving updates file metadata, not the document's editable content. */
export function sameProjectContent(left: ProjectState, right: ProjectState): boolean {
  return JSON.stringify({ ...left, last_modified: undefined, project_name: undefined })
    === JSON.stringify({ ...right, last_modified: undefined, project_name: undefined });
}

export class ProjectHistory<T> {
  private entries: T[] = [];
  private index = -1;

  constructor(
    private readonly clone: (value: T) => T,
    private readonly maxEntries = 50,
    private readonly equivalent: (left: T, right: T) => boolean = Object.is,
  ) {}

  reset(initial?: T): void {
    this.entries = initial === undefined ? [] : [this.clone(initial)];
    this.index = this.entries.length - 1;
  }

  push(value: T): void {
    if (this.index >= 0 && this.equivalent(this.entries[this.index], value)) {
      this.entries[this.index] = this.clone(value);
      return;
    }
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(this.clone(value));
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    this.index = this.entries.length - 1;
  }

  undo(): T | null {
    if (!this.canUndo) return null;
    this.index -= 1;
    return this.clone(this.entries[this.index]);
  }

  redo(): T | null {
    if (!this.canRedo) return null;
    this.index += 1;
    return this.clone(this.entries[this.index]);
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }
}
