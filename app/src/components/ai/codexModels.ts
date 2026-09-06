import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

export interface CodexModelOption {
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
}

export async function listCodexModels(): Promise<CodexModelOption[]> {
  return invoke<CodexModelOption[]>('list_codex_models');
}

export function useCodexAvailability(enabled: boolean): boolean {
  const [isCodexAvailable, setIsCodexAvailable] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsCodexAvailable(false);
      return;
    }
    let cancelled = false;
    listCodexModels()
      .then(models => {
        if (!cancelled) setIsCodexAvailable(models.length > 0);
      })
      .catch(() => {
        if (!cancelled) setIsCodexAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return isCodexAvailable;
}

export function preferredCodexModel(
  models: CodexModelOption[],
  storageKey: string,
): string {
  const storedModel = localStorage.getItem(storageKey);
  return models.find(option => option.model === storedModel)?.model
    || models.find(option => option.isDefault)?.model
    || models[0]?.model
    || '';
}
