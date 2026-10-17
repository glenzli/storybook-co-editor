import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store, cache, disk } = vi.hoisted(() => {
  const cache = new Map<string, unknown>();
  const disk = new Map<string, unknown>();
  const store = {
    get: vi.fn(async (key: string) => structuredClone(cache.get(key))),
    set: vi.fn(async (key: string, value: unknown) => { cache.set(key, structuredClone(value)); }),
    save: vi.fn(async () => { disk.set('recentProjects', structuredClone(cache.get('recentProjects'))); }),
  };
  return { store, cache, disk };
});
vi.mock('@tauri-apps/plugin-store', () => ({ load: vi.fn(async () => store) }));

import { forgetRecentProject, loadRecentProjects, rememberRecentProject } from './recentProjects';

const projects = [
  { path: '/books/one.scproj', name: 'Same title', lastOpened: 30 },
  { path: '/books/two.scproj', name: 'Same title', lastOpened: 20 },
  { path: '/books/three.scproj', name: 'Third', lastOpened: 10 },
];
beforeEach(() => {
  vi.clearAllMocks();
  cache.set('recentProjects', structuredClone(projects));
  cache.set('otherPreference', 'preserve');
  disk.set('recentProjects', structuredClone(projects));
});

describe('recent project removal', () => {
  it('removes only the selected path, keeps ordering and unrelated preferences, and persists the result', async () => {
    expect(await forgetRecentProject('/books/two.scproj')).toEqual([projects[0], projects[2]]);
    expect(disk.get('recentProjects')).toEqual([projects[0], projects[2]]);
    expect(await loadRecentProjects()).toEqual([projects[0], projects[2]]);
    expect(cache.get('otherPreference')).toBe('preserve');
  });
  it('serializes rapid removals and opening another project without restoring removed entries', async () => {
    const tasks = [forgetRecentProject('/books/one.scproj'), forgetRecentProject('/books/two.scproj'),
      rememberRecentProject('/books/three.scproj', 'Reopened')];
    await Promise.all(tasks);
    const remaining = await loadRecentProjects();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ path: '/books/three.scproj', name: 'Reopened' });
    expect(disk.get('recentProjects')).toEqual(remaining);
  });
  it('restores cached history after a failed save and accepts the next removal', async () => {
    store.save.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(forgetRecentProject('/books/one.scproj')).rejects.toThrow('disk unavailable');
    expect(await loadRecentProjects()).toEqual(projects);
    expect(disk.get('recentProjects')).toEqual(projects);
    expect(await forgetRecentProject('/books/two.scproj')).toEqual([projects[0], projects[2]]);
  });
  it('can clear the last entry and add the project again when it is reopened', async () => {
    for (const project of projects) await forgetRecentProject(project.path);
    expect(await loadRecentProjects()).toEqual([]);
    const reopened = await rememberRecentProject(projects[0].path, projects[0].name);
    expect(reopened).toHaveLength(1);
    expect(reopened[0].path).toBe(projects[0].path);
  });
});
