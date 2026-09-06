import { useCallback, useState } from 'react';

export type AiProvider = 'codex';

export interface AiSettings {
  enabled: boolean;
  provider: AiProvider;
}

export const AI_PROVIDERS: AiProvider[] = ['codex'];

const ENABLED_STORAGE_KEY = 'storybook-ai-enabled';
const PROVIDER_STORAGE_KEY = 'storybook-ai-provider';

export function loadAiSettings(storage: Pick<Storage, 'getItem'>): AiSettings {
  const storedProvider = storage.getItem(PROVIDER_STORAGE_KEY);
  return {
    enabled: storage.getItem(ENABLED_STORAGE_KEY) === 'true',
    provider: AI_PROVIDERS.includes(storedProvider as AiProvider)
      ? storedProvider as AiProvider
      : 'codex',
  };
}

export function useAiSettings() {
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings(localStorage));

  const setEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(ENABLED_STORAGE_KEY, String(enabled));
    setSettings(current => ({ ...current, enabled }));
  }, []);

  const setProvider = useCallback((provider: AiProvider) => {
    localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
    setSettings(current => ({ ...current, provider }));
  }, []);

  return { settings, setEnabled, setProvider };
}
