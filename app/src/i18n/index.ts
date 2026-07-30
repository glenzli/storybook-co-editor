import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { enUS } from './locales/en-US';
import { zhCN } from './locales/zh-CN';

export const APP_LANGUAGES = ['zh-CN', 'en-US'] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

const LANGUAGE_STORAGE_KEY = 'storybook-co-editor.interface-language';

export function normalizeAppLanguage(language?: string | null): AppLanguage {
  return language?.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';
}

function detectInitialLanguage(): AppLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored) return normalizeAppLanguage(stored);

  const browserLanguage = navigator.languages?.[0] || navigator.language;
  return normalizeAppLanguage(browserLanguage);
}

const initialLanguage = detectInitialLanguage();

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    lng: initialLanguage,
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
  });

document.documentElement.lang = initialLanguage;

export async function setAppLanguage(language: AppLanguage) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.documentElement.lang = language;
  await i18n.changeLanguage(language);
}

export function getAppLanguage(): AppLanguage {
  return normalizeAppLanguage(i18n.resolvedLanguage);
}

export function getPublicationLanguage(metadataLanguage?: string): AppLanguage {
  const normalized = metadataLanguage?.trim().toLowerCase();
  if (normalized?.startsWith('zh')) return 'zh-CN';
  if (normalized?.startsWith('en')) return 'en-US';
  return getAppLanguage();
}

export function localizeAppError(error: unknown): string {
  const raw = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : String(error);
  const separator = raw.indexOf('|');
  const code = separator >= 0 ? raw.slice(0, separator) : raw;
  const detail = separator >= 0 ? raw.slice(separator + 1) : '';
  const key = `errors.backend.${code}`;

  if (!i18n.exists(key)) return raw;
  const message = i18n.t(key);
  return detail ? `${message}: ${detail}` : message;
}

export default i18n;
