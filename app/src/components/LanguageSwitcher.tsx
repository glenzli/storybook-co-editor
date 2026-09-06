import { Check, ChevronRight, Languages } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppLanguage, setAppLanguage, type AppLanguage } from '../i18n';

interface LanguageSwitcherProps {
  compact?: boolean;
  menuItem?: boolean;
  className?: string;
  onSelect?: () => void;
}

export function LanguageSwitcher({
  compact = false,
  menuItem = false,
  className = '',
  onSelect,
}: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (menuItem) {
    const activeLanguage = getAppLanguage();
    const chooseLanguage = async (language: AppLanguage) => {
      await setAppLanguage(language);
      setIsMenuOpen(false);
      onSelect?.();
    };

    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsMenuOpen(open => !open)}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted ${className}`}
          title={t('common.language')}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
        >
          <Languages size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{t('common.language')}</span>
          <ChevronRight size={13} className="ml-auto text-muted-foreground" aria-hidden="true" />
        </button>
        {isMenuOpen && (
          <div className="absolute right-full top-0 z-10 mr-1 w-40 overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg" role="menu">
            {([
              ['zh-CN', t('common.chinese')],
              ['en-US', t('common.english')],
            ] as Array<[AppLanguage, string]>).map(([language, label]) => (
              <button
                key={language}
                type="button"
                onClick={() => void chooseLanguage(language)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
                role="menuitemradio"
                aria-checked={activeLanguage === language}
              >
                <span>{label}</span>
                {activeLanguage === language && <Check size={13} className="ml-auto text-primary" aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <label
      className={`inline-flex shrink-0 items-center gap-1.5 text-muted-foreground ${className}`}
      title={t('common.language')}
    >
      <Languages size={compact ? 14 : 16} className="shrink-0" aria-hidden="true" />
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={getAppLanguage()}
        onChange={(event) => void setAppLanguage(event.target.value as AppLanguage)}
        className={`cursor-pointer border-0 bg-transparent text-foreground outline-none ${compact ? 'w-[74px] min-w-[74px] text-[11px]' : 'text-sm'}`}
        aria-label={t('common.language')}
      >
        <option value="zh-CN">{t('common.chinese')}</option>
        <option value="en-US">{t('common.english')}</option>
      </select>
    </label>
  );
}
