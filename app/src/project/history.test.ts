import type { ProjectState } from './model';
import { describe, expect, it } from 'vitest';
import { ProjectHistory, sameProjectContent } from './history';

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
  it('ignores save metadata without consuming undo or discarding redo', () => {
    const history = new ProjectHistory<ProjectState>(structuredClone, 50, sameProjectContent);
    const original = { project_name: 'Book', last_modified: '1', global_script: 'original' } as ProjectState;
    const changed = { ...original, global_script: 'edited' };
    history.reset(original); history.push(changed);
    history.push({ ...changed, project_name: 'Saved Book', last_modified: '2' });
    expect(history.undo()?.global_script).toBe('original');
    history.push({ ...original, project_name: 'Saved Book', last_modified: '3' });
    expect(history.canRedo).toBe(true);
    expect(history.redo()?.global_script).toBe('edited');
  });

});
