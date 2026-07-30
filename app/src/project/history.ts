export class ProjectHistory<T> {
  private entries: T[] = [];
  private index = -1;

  constructor(
    private readonly clone: (value: T) => T,
    private readonly maxEntries = 50,
  ) {}

  reset(initial?: T): void {
    this.entries = initial === undefined ? [] : [this.clone(initial)];
    this.index = this.entries.length - 1;
  }

  push(value: T): void {
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
