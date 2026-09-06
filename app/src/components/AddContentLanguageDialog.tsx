import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft, Check, Languages, Loader2, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localizeAppError } from '../i18n';
import {
  getProjectLanguage,
  normalizeProjectLanguageTag,
  type ProjectLanguageSeed,
} from '../project/languages';
import type { ProjectState, PublicationMetadata } from '../project/model';
import { validateStoryScript } from '../story/script';
import {
  listCodexModels,
  preferredCodexModel,
  type CodexModelOption,
} from './ai/codexModels';

type CreationMode = 'blank' | 'translate';

interface TranslationResult {
  script: string;
  publication_metadata?: PublicationMetadata;
  notes: string;
}

interface TranslationProposal extends TranslationResult {
  sourceLanguage: string;
  targetLanguage: string;
}

interface AddContentLanguageDialogProps {
  open: boolean;
  projectState: ProjectState;
  languages: string[];
  activeLanguage: string;
  isAiAvailable: boolean;
  onClose: () => void;
  onAdd: (language: string, seed?: ProjectLanguageSeed) => void;
}

const fieldClass = 'h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50';

export function AddContentLanguageDialog({
  open,
  projectState,
  languages,
  activeLanguage,
  isAiAvailable,
  onClose,
  onAdd,
}: AddContentLanguageDialogProps) {
  const { t } = useTranslation();
  const [targetLanguage, setTargetLanguage] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState(activeLanguage);
  const [mode, setMode] = useState<CreationMode>('blank');
  const [models, setModels] = useState<CodexModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<TranslationProposal | null>(null);
  const latestRevisionRef = useRef(projectState.last_modified);

  useEffect(() => {
    latestRevisionRef.current = projectState.last_modified;
  }, [projectState.last_modified]);

  useEffect(() => {
    if (!open) return;
    const suggested = activeLanguage.toLowerCase().startsWith('zh') ? 'en-US' : 'zh-CN';
    setTargetLanguage(suggested);
    setSourceLanguage(activeLanguage);
    setMode(isAiAvailable ? 'translate' : 'blank');
    setError(null);
    setProposal(null);
  }, [activeLanguage, isAiAvailable, open]);

  useEffect(() => {
    if (!open || mode !== 'translate' || !isAiAvailable) return;
    let cancelled = false;
    setIsLoadingModels(true);
    setError(null);
    listCodexModels()
      .then(availableModels => {
        if (cancelled) return;
        setModels(availableModels);
        setSelectedModel(preferredCodexModel(availableModels, 'storybook-codex-translate-model'));
      })
      .catch(reason => {
        if (cancelled) return;
        setModels([]);
        setSelectedModel('');
        setError(t('contentLanguage.modelListFailed', { error: localizeAppError(reason) }));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingModels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAiAvailable, mode, open, t]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isTranslating) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isTranslating, onClose, open]);

  const sourceContent = useMemo(
    () => getProjectLanguage(projectState, sourceLanguage),
    [projectState, sourceLanguage],
  );
  const proposalIssues = proposal ? validateStoryScript(proposal.script) : [];

  if (!open) return null;

  const normalizedTarget = normalizeProjectLanguageTag(targetLanguage);
  const targetIsDuplicate = normalizedTarget ? languages.includes(normalizedTarget) : false;
  const canTranslate = isAiAvailable
    && Boolean(selectedModel)
    && Boolean(sourceContent.script.trim())
    && !isLoadingModels;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const target = normalizeProjectLanguageTag(targetLanguage);
    if (!target) {
      setError(t('contentLanguage.invalid'));
      return;
    }
    if (languages.includes(target)) {
      setError(t('contentLanguage.duplicate', { language: target }));
      return;
    }
    if (mode === 'blank') {
      onAdd(target);
      onClose();
      return;
    }
    if (!canTranslate) return;

    const expectedRevision = projectState.last_modified;
    setIsTranslating(true);
    setError(null);
    localStorage.setItem('storybook-codex-translate-model', selectedModel);
    try {
      const result = await invoke<TranslationResult>('translate_story_with_codex', {
        script: sourceContent.script,
        sourceLanguage,
        targetLanguage: target,
        publicationMetadata: sourceContent.publication_metadata || null,
        model: selectedModel,
      });
      if (latestRevisionRef.current !== expectedRevision) {
        setError(localizeAppError('STALE_PROJECT_STATE'));
        return;
      }
      setProposal({ ...result, sourceLanguage, targetLanguage: target });
    } catch (reason) {
      setError(t('contentLanguage.translationFailed', { error: localizeAppError(reason) }));
    } finally {
      setIsTranslating(false);
    }
  };

  const applyProposal = () => {
    if (!proposal || !proposal.script.trim() || proposalIssues.length > 0) return;
    if (languages.includes(proposal.targetLanguage)) {
      setError(t('contentLanguage.duplicate', { language: proposal.targetLanguage }));
      setProposal(null);
      return;
    }
    onAdd(proposal.targetLanguage, {
      script: proposal.script.trim(),
      publication_metadata: proposal.publication_metadata,
    });
    onClose();
  };

  const metadata = proposal?.publication_metadata;
  const metadataRows = metadata ? [
    [t('publication.fields.workTitle'), metadata.title],
    [
      t('publication.fields.contributors'),
      metadata.contributors
        ?.map(contributor => `${t(`publication.roles.${contributor.role}`)}：${contributor.name}`)
        .join('；'),
    ],
    [t('publication.fields.publisher'), metadata.publisher],
    [t('publication.fields.description'), metadata.description],
    [t('publication.fields.keywords'), metadata.keywords?.join('、')],
    [t('publication.fields.copyrightHolder'), metadata.copyright_holder],
    [t('publication.fields.copyrightNotice'), metadata.copyright_notice],
  ].filter((row): row is [string, string] => Boolean(row[1]?.trim())) : [];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4" onClick={isTranslating ? undefined : onClose} role="presentation">
      <section
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-content-language-title"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Languages size={18} className="text-primary" />
            <h2 id="add-content-language-title" className="text-base font-semibold">
              {proposal ? t('contentLanguage.reviewTitle') : t('contentLanguage.addTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isTranslating}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </header>

        {proposal ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <p className="text-sm text-muted-foreground">
                {t('contentLanguage.reviewDescription', {
                  source: proposal.sourceLanguage,
                  target: proposal.targetLanguage,
                })}
              </p>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('contentLanguage.translatedScript')}
                </span>
                <textarea
                  value={proposal.script}
                  onChange={event => setProposal(current => current ? { ...current, script: event.target.value } : current)}
                  className="min-h-64 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              {proposalIssues.length > 0 && (
                <p className="text-sm text-red-500">{t('contentLanguage.invalidProposal')}</p>
              )}
              <section className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {t('contentLanguage.translatedMetadata')}
                </h3>
                {metadataRows.length > 0 ? (
                  <dl className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
                    {metadataRows.map(([label, value]) => (
                      <div key={label} className="grid grid-cols-[140px_1fr] gap-3">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="whitespace-pre-wrap break-words">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('contentLanguage.noMetadata')}</p>
                )}
              </section>
              {proposal.notes && (
                <section className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                  <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                    {t('contentLanguage.notes')}
                  </h3>
                  <p className="whitespace-pre-wrap">{proposal.notes}</p>
                </section>
              )}
            </div>
            <footer className="flex items-center justify-between border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => setProposal(null)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"
              >
                <ArrowLeft size={14} /> {t('contentLanguage.back')}
              </button>
              <button
                type="button"
                onClick={applyProposal}
                disabled={!proposal.script.trim() || proposalIssues.length > 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check size={14} /> {t('contentLanguage.createTranslated')}
              </button>
            </footer>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('contentLanguage.targetLanguage')}
                </span>
                <input
                  autoFocus
                  value={targetLanguage}
                  onChange={event => {
                    setTargetLanguage(event.target.value);
                    setError(null);
                  }}
                  className={fieldClass}
                  placeholder="en-US"
                  disabled={isTranslating}
                />
              </label>

              <section className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('contentLanguage.creationMode')}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('blank');
                      setError(null);
                    }}
                    className={`rounded-md border px-3 py-2 text-sm ${mode === 'blank' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}
                  >
                    {t('contentLanguage.blank')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAiAvailable) return;
                      setMode('translate');
                      setError(null);
                    }}
                    disabled={!isAiAvailable}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${mode === 'translate' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}
                    title={!isAiAvailable ? t('ai.unavailable') : undefined}
                  >
                    <Sparkles size={14} /> {t('contentLanguage.translateWithAi')}
                  </button>
                </div>
              </section>

              {mode === 'translate' && (
                <section className="space-y-4 rounded-md border border-border bg-muted/15 p-4">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('contentLanguage.sourceLanguage')}
                    </span>
                    <select
                      value={sourceLanguage}
                      onChange={event => setSourceLanguage(event.target.value)}
                      className={fieldClass}
                      disabled={isTranslating}
                    >
                      {languages.map(language => <option key={language} value={language}>{language}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('contentLanguage.model')}
                    </span>
                    <select
                      value={selectedModel}
                      onChange={event => setSelectedModel(event.target.value)}
                      className={fieldClass}
                      disabled={isLoadingModels || isTranslating}
                    >
                      {isLoadingModels && <option value="">{t('contentLanguage.loadingModels')}</option>}
                      {!isLoadingModels && models.map(option => (
                        <option key={option.model} value={option.model}>{option.displayName}</option>
                      ))}
                    </select>
                  </label>
                  {!sourceContent.script.trim() && (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      {t('contentLanguage.sourceEmpty')}
                    </p>
                  )}
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t('contentLanguage.translationScope')}
                  </p>
                </section>
              )}

              {(targetIsDuplicate || error) && (
                <p className="text-sm text-red-500">
                  {targetIsDuplicate
                    ? t('contentLanguage.duplicate', { language: normalizedTarget })
                    : error}
                </p>
              )}
            </div>

            <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isTranslating}
                className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted disabled:opacity-40"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isTranslating || targetIsDuplicate || (mode === 'translate' && !canTranslate)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isTranslating && <Loader2 size={14} className="animate-spin" />}
                {isTranslating
                  ? t('contentLanguage.translating')
                  : mode === 'translate'
                    ? t('contentLanguage.translate')
                    : t('contentLanguage.createBlank')}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
