import { useState } from 'react';
import { Languages, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProjectLanguageSeed } from '../project/languages';
import type { ProjectState } from '../project/model';
import { AddContentLanguageDialog } from './AddContentLanguageDialog';

interface ContentLanguageSwitcherProps {
  languages: string[];
  activeLanguage: string;
  defaultLanguage: string;
  projectState: ProjectState | null;
  isAiAvailable: boolean;
  onChange: (language: string) => void;
  onAdd: (language: string, seed?: ProjectLanguageSeed) => void;
  onRemove: (language: string) => void;
}

export function ContentLanguageSwitcher({
  languages,
  activeLanguage,
  defaultLanguage,
  projectState,
  isAiAvailable,
  onChange,
  onAdd,
  onRemove,
}: ContentLanguageSwitcherProps) {
  const { t } = useTranslation();
  const [isAdding, setIsAdding] = useState(false);

  const removeLanguage = () => {
    if (languages.length <= 1) return;
    if (window.confirm(t('contentLanguage.removeConfirm', { language: activeLanguage }))) {
      onRemove(activeLanguage);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Languages size={14} className="shrink-0 text-muted-foreground" />
        <label htmlFor="content-language" className="sr-only">
          {t('contentLanguage.label')}
        </label>
        <select
          id="content-language"
          value={activeLanguage}
          onChange={event => onChange(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
          title={t('contentLanguage.label')}
        >
          {languages.map(language => (
            <option key={language} value={language}>
              {language === defaultLanguage
                ? t('contentLanguage.defaultOption', { language })
                : language}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={t('contentLanguage.add')}
          aria-label={t('contentLanguage.add')}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          onClick={removeLanguage}
          disabled={languages.length <= 1}
          className="rounded p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
          title={t('contentLanguage.remove')}
          aria-label={t('contentLanguage.remove')}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {projectState && (
        <AddContentLanguageDialog
          open={isAdding}
          projectState={projectState}
          languages={languages}
          activeLanguage={activeLanguage}
          isAiAvailable={isAiAvailable}
          onClose={() => setIsAdding(false)}
          onAdd={onAdd}
        />
      )}
    </>
  );
}
