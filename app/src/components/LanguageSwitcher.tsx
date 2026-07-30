import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getAppLanguage, setAppLanguage, type AppLanguage } from '../i18n';

interface LanguageSwitcherProps {
  compact?: boolean;
  className?: string;
}

export function LanguageSwitcher({ compact = false, className = '' }: LanguageSwitcherProps) {
  const { t } = useTranslation();

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
