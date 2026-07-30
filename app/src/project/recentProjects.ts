import { load } from '@tauri-apps/plugin-store';

const MAX_RECENT_PROJECTS = 10;
const SETTINGS_FILE = 'settings.json';
const STORE_KEY = 'recentProjects';

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

export async function loadRecentProjects(): Promise<RecentProject[]> {
  const store = await load(SETTINGS_FILE, { defaults: {}, autoSave: false });
  return await store.get<RecentProject[]>(STORE_KEY) ?? [];
}

export async function saveRecentProjects(projects: RecentProject[]): Promise<void> {
  const store = await load(SETTINGS_FILE, { defaults: {}, autoSave: false });
  await store.set(STORE_KEY, projects);
  await store.save();
}

export function withRecentProject(
  projects: RecentProject[],
  path: string,
  name: string,
  lastOpened = Date.now(),
): RecentProject[] {
  const filtered = projects.filter(project => project.path !== path);
  return [{ path, name, lastOpened }, ...filtered].slice(0, MAX_RECENT_PROJECTS);
}
