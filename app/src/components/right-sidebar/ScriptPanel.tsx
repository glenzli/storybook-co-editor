import { invoke } from '@tauri-apps/api/core';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localizeAppError } from '../../i18n';
import {
  getStoryPageIndexAtOffset,
  validateStoryScript,
} from '../../story/script';

interface CodexPolishResult {
  script: string;
  notes: string;
}

interface CodexModelOption {
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
}

interface ScriptPanelProps {
  value: string;
  onChange: (value: string) => void;
  onCursorChange: (pageIndex: number | null) => void;
}

export function ScriptPanel({ value, onChange, onCursorChange }: ScriptPanelProps) {
  const { t, i18n } = useTranslation();
  const [localValue, setLocalValue] = useState(value);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isPolishSetupOpen, setIsPolishSetupOpen] = useState(false);
  const [models, setModels] = useState<CodexModelOption[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [polishInstructions, setPolishInstructions] = useState('');
  const [proposal, setProposal] = useState<CodexPolishResult | null>(null);
  const [polishError, setPolishError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => {
    if (!isPolishSetupOpen) return;
    let isCancelled = false;
    setIsLoadingModels(true);
    setPolishError(null);
    invoke<CodexModelOption[]>('list_codex_models')
      .then(availableModels => {
        if (isCancelled) return;
        setModels(availableModels);
        const savedModel = localStorage.getItem('storybook-codex-polish-model');
        const initialModel = availableModels.find(option => option.model === savedModel)
          || availableModels.find(option => option.isDefault)
          || availableModels[0];
        setSelectedModel(initialModel?.model || '');
      })
      .catch(error => {
        if (!isCancelled) {
          setModels([]);
          setSelectedModel('');
          setPolishError(t('ai.modelListFailed', { error: localizeAppError(error) }));
        }
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingModels(false);
      });
    return () => {
      isCancelled = true;
    };
  }, [isPolishSetupOpen, t]);

  const commitValue = (nextValue: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    onChange(nextValue);
  };

  const handleChange = (nextValue: string) => {
    setLocalValue(nextValue);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onChange(nextValue), 1500);
  };

  const handlePolish = async () => {
    const errors = validateStoryScript(localValue);
    if (errors.length > 0 || !localValue.trim() || !selectedModel) return;
    commitValue(localValue);
    setIsPolishing(true);
    setPolishError(null);
    localStorage.setItem('storybook-codex-polish-model', selectedModel);
    try {
      const result = await invoke<CodexPolishResult>('polish_story_with_codex', {
        script: localValue,
        language: i18n.resolvedLanguage || i18n.language,
        model: selectedModel,
        instructions: polishInstructions.trim(),
      });
      setProposal(result);
      setIsPolishSetupOpen(false);
    } catch (error) {
      setPolishError(t('ai.polishFailed', { error: localizeAppError(error) }));
    } finally {
      setIsPolishing(false);
    }
  };

  const applyProposal = () => {
    if (!proposal || validateStoryScript(proposal.script).length > 0) return;
    setLocalValue(proposal.script);
    commitValue(proposal.script);
    setProposal(null);
  };

  const errors = validateStoryScript(localValue);
  const proposalErrors = proposal ? validateStoryScript(proposal.script) : [];
  const selectedModelInfo = models.find(option => option.model === selectedModel);
  const lineCount = localValue.split('\n').length;

  return (
    <>
      <div className="p-4 flex-1 flex flex-col gap-3 w-full overflow-hidden">
        <div className="flex items-start justify-between gap-3 flex-shrink-0">
          <p className="text-xs text-muted-foreground">
            {t('rightSidebar.scriptHelp')}
          </p>
          <button
            type="button"
            onClick={() => setIsPolishSetupOpen(true)}
            disabled={isPolishing || errors.length > 0 || !localValue.trim()}
            className="h-8 px-2.5 flex items-center gap-1.5 rounded border border-border bg-background text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title={t('ai.polishDescription')}
          >
            {isPolishing
              ? <Loader2 size={13} className="animate-spin" />
              : <Sparkles size={13} />}
            {t('ai.polish')}
          </button>
        </div>

        <div className="flex-1 flex min-h-0 bg-background border border-border rounded-md focus-within:ring-1 focus-within:ring-primary overflow-hidden transition-all">
          <div
            ref={gutterRef}
            className="w-10 py-3 pl-2 pr-2 text-right text-xs text-muted-foreground/50 bg-muted/10 font-mono select-none overflow-hidden shrink-0 border-r border-border/50"
          >
            {Array.from({ length: lineCount }).map((_, index) => (
              <div key={index} className="leading-[1.5rem]">{index + 1}</div>
            ))}
          </div>
          <textarea
            className="flex-1 w-full bg-transparent py-3 px-3 text-sm text-foreground focus:outline-none resize-none font-mono whitespace-pre overflow-auto leading-[1.5rem]"
            value={localValue}
            onChange={event => handleChange(event.target.value)}
            onBlur={() => {
              if (localValue !== value) commitValue(localValue);
            }}
            onSelect={event => {
              onCursorChange(getStoryPageIndexAtOffset(
                localValue,
                event.currentTarget.selectionStart,
              ));
            }}
            onScroll={event => {
              if (gutterRef.current) {
                gutterRef.current.scrollTop = event.currentTarget.scrollTop;
              }
            }}
            wrap="off"
          />
        </div>

        {errors.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-md p-2 max-h-32 overflow-y-auto shrink-0 flex flex-col gap-1">
            <span className="text-xs font-bold text-red-500 mb-0.5">
              {t('rightSidebar.invalidTags')}
            </span>
            <ul className="text-xs text-red-500/80 space-y-0.5">
              {errors.map((error, index) => (
                <li key={index}>
                  {t('rightSidebar.invalidTagLine', { line: error.line })}{' '}
                  <code className="bg-red-500/20 px-1 rounded">{error.tag}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        {polishError && (
          <div className="text-xs text-red-500 border border-red-500/30 bg-red-500/10 rounded p-2">
            {polishError}
          </div>
        )}
      </div>

      {isPolishSetupOpen && (
        <div className="fixed inset-0 z-[100] bg-black/55 flex items-center justify-center p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="codex-polish-setup-title"
            className="w-full max-w-lg max-h-[86vh] bg-card border border-border shadow-2xl rounded-md flex flex-col overflow-hidden"
          >
            <header className="h-14 px-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <div>
                <h2 id="codex-polish-setup-title" className="text-sm font-semibold">
                  {t('ai.setupTitle')}
                </h2>
                <p className="text-xs text-muted-foreground">{t('ai.setupDescription')}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPolishSetupOpen(false)}
                disabled={isPolishing}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                title={t('common.close')}
              >
                <X size={16} />
              </button>
            </header>

            <div className="p-4 overflow-y-auto flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="codex-polish-model" className="text-xs font-medium">
                  {t('ai.model')}
                </label>
                <select
                  id="codex-polish-model"
                  value={selectedModel}
                  onChange={event => setSelectedModel(event.target.value)}
                  disabled={isLoadingModels || isPolishing || models.length === 0}
                  className="h-9 w-full rounded border border-border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  {isLoadingModels && <option value="">{t('ai.loadingModels')}</option>}
                  {!isLoadingModels && models.length === 0 && (
                    <option value="">{t('ai.noModels')}</option>
                  )}
                  {models.map(option => (
                    <option key={option.model} value={option.model}>
                      {option.isDefault
                        ? t('ai.defaultModel', { name: option.displayName })
                        : option.displayName}
                    </option>
                  ))}
                </select>
                {selectedModelInfo?.description && (
                  <p className="text-xs text-muted-foreground">{selectedModelInfo.description}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="codex-polish-instructions" className="text-xs font-medium">
                  {t('ai.instructions')}
                </label>
                <textarea
                  id="codex-polish-instructions"
                  value={polishInstructions}
                  onChange={event => setPolishInstructions(event.target.value)}
                  disabled={isPolishing}
                  maxLength={20000}
                  rows={5}
                  placeholder={t('ai.instructionsPlaceholder')}
                  className="w-full resize-y rounded border border-border bg-background p-2.5 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>

              <p className="text-xs text-muted-foreground border-t border-border pt-3">
                {t('ai.dataNotice')}
              </p>

              {polishError && (
                <div className="text-xs text-red-500 border border-red-500/30 bg-red-500/10 rounded p-2">
                  {polishError}
                </div>
              )}
            </div>

            <footer className="px-4 py-3 border-t border-border flex items-center justify-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsPolishSetupOpen(false)}
                disabled={isPolishing}
                className="h-8 px-3 rounded border border-border text-xs hover:bg-muted disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handlePolish}
                disabled={isPolishing || isLoadingModels || !selectedModel}
                className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
              >
                {isPolishing
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Sparkles size={13} />}
                {isPolishing ? t('ai.polishing') : t('ai.startPolish')}
              </button>
            </footer>
          </section>
        </div>
      )}

      {proposal && (
        <div className="fixed inset-0 z-[100] bg-black/55 flex items-center justify-center p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="codex-polish-title"
            className="w-full max-w-4xl max-h-[86vh] bg-card border border-border shadow-2xl rounded-md flex flex-col overflow-hidden"
          >
            <header className="h-12 px-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <div>
                <h2 id="codex-polish-title" className="text-sm font-semibold">
                  {t('ai.reviewTitle')}
                </h2>
                <p className="text-xs text-muted-foreground">{t('ai.reviewDescription')}</p>
              </div>
              <button
                type="button"
                onClick={() => setProposal(null)}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title={t('common.close')}
              >
                <X size={16} />
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 min-h-0 flex-1 overflow-y-auto">
              <div className="p-4 border-b md:border-b-0 md:border-r border-border flex flex-col min-h-0">
                <label className="text-xs font-medium mb-2">{t('ai.original')}</label>
                <textarea
                  readOnly
                  value={localValue}
                  className="flex-1 min-h-[220px] md:min-h-[320px] resize-none rounded border border-border bg-muted/30 p-3 font-mono text-xs text-muted-foreground outline-none"
                />
              </div>
              <div className="p-4 flex flex-col min-h-0">
                <label className="text-xs font-medium mb-2">{t('ai.proposal')}</label>
                <textarea
                  value={proposal.script}
                  onChange={event => setProposal({
                    ...proposal,
                    script: event.target.value,
                  })}
                  className="flex-1 min-h-[220px] md:min-h-[320px] resize-none rounded border border-border bg-background p-3 font-mono text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">
                  {proposal.notes || t('ai.noNotes')}
                </p>
                {proposalErrors.length > 0 && (
                  <p className="text-xs text-red-500 mt-1">{t('ai.invalidProposal')}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setProposal(null)}
                  className="h-8 px-3 rounded border border-border text-xs hover:bg-muted"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={applyProposal}
                  disabled={proposalErrors.length > 0 || !proposal.script.trim()}
                  className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check size={13} />
                  {t('ai.apply')}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
