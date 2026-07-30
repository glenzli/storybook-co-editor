import type { PrintSettings, ProjectState } from './model';

type LegacyProjectState = Partial<ProjectState> & {
  author_name?: string;
  print_settings?: Partial<PrintSettings> & { cmyk_convert?: unknown };
};

export function migrateProjectState(rawState: unknown): ProjectState {
  if (!rawState || typeof rawState !== 'object') return rawState as ProjectState;
  const state = { ...(rawState as LegacyProjectState) };

  if (typeof state.schema_version !== 'number') {
    state.schema_version = 1;
  }

  if (state.schema_version === 1) {
    if (state.author_name && state.author_name.trim() !== '') {
      const prefix = `[Author]\n${state.author_name}\n\n`;
      state.global_script = state.global_script ? prefix + state.global_script : prefix.trim();
    }
    delete state.author_name;
    state.schema_version = 2;
  }

  if (state.print_settings && typeof state.print_settings === 'object') {
    delete state.print_settings.cmyk_convert;
  }

  return state as ProjectState;
}
