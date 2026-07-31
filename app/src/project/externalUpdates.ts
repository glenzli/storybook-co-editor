import type { ProjectState } from './model';

const BROWSER_EVENT = 'storybook-external-project-update';

export interface ExternalProjectUpdate {
  workspace_id: string;
  state: ProjectState;
  source: 'mcp' | string;
}

export function dispatchExternalProjectUpdate(update: ExternalProjectUpdate): void {
  window.dispatchEvent(new CustomEvent<ExternalProjectUpdate>(BROWSER_EVENT, { detail: update }));
}

export function subscribeExternalProjectUpdates(
  listener: (update: ExternalProjectUpdate) => void,
): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<ExternalProjectUpdate>).detail);
  };
  window.addEventListener(BROWSER_EVENT, handler);
  return () => window.removeEventListener(BROWSER_EVENT, handler);
}
