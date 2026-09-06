import { describe, expect, it } from 'vitest';
import { loadAiSettings } from './aiSettings';

function storage(values: Record<string, string>): Pick<Storage, 'getItem'> {
  return {
    getItem: key => values[key] ?? null,
  };
}

describe('loadAiSettings', () => {
  it('keeps AI support disabled until the user enables it', () => {
    expect(loadAiSettings(storage({}))).toEqual({
      enabled: false,
      provider: 'codex',
    });
  });

  it('loads the supported provider and rejects unknown stored values', () => {
    expect(loadAiSettings(storage({
      'storybook-ai-enabled': 'true',
      'storybook-ai-provider': 'codex',
    }))).toEqual({ enabled: true, provider: 'codex' });
    expect(loadAiSettings(storage({
      'storybook-ai-enabled': 'true',
      'storybook-ai-provider': 'unknown',
    }))).toEqual({ enabled: true, provider: 'codex' });
  });
});
