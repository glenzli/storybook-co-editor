import { describe, expect, it } from 'vitest';
import { ProjectHistory } from './history';

describe('ProjectHistory', () => {
  it('owns undo, redo and forward-history truncation', () => {
    const history = new ProjectHistory<{ value: number }>(structuredClone);
    history.push({ value: 1 });
    history.push({ value: 2 });
    history.push({ value: 3 });

    expect(history.undo()).toEqual({ value: 2 });
    expect(history.canRedo).toBe(true);

    history.push({ value: 4 });
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toEqual({ value: 2 });
  });

  it('resets history at a project-session boundary', () => {
    const history = new ProjectHistory<{ value: number }>(structuredClone);
    history.push({ value: 1 });
    history.push({ value: 2 });
    history.reset({ value: 10 });

    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});
