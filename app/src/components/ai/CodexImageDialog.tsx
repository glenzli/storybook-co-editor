import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localizeAppError } from '../../i18n';
import {
  listCodexModels,
  preferredCodexModel,
  type CodexModelOption,
} from './codexModels';

interface CodexImageResult {
  filename: string;
  width: number;
  height: number;
  usage?: CodexTokenUsage | null;
}

interface CodexTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

interface CodexImageReference {
  pageIndex: number;
  image: string;
  sourceImageUrl: string;
  script: string;
}

interface CodexImageProgress {
  requestId: string;
  phase: string;
  detail?: string | null;
}

export type CodexImageRequest =
  | {
      kind: 'redraw';
      language: string;
      pageIndex: number;
      sourceImage: string;
      sourceImageUrl: string;
      expectedLastModified: string;
    }
  | {
      kind: 'create';
      language: string;
      width: number;
      height: number;
      expectedLastModified: string;
      referencePages: CodexImageReference[];
      initialReferencePageIndexes: number[];
    };

interface CodexImageDialogProps {
  request: CodexImageRequest | null;
  onClose: () => void;
  onCreated: (pageIndex: number) => void;
}

const MODEL_STORAGE_KEY = 'storybook-codex-image-model';
const EFFORT_STORAGE_KEY = 'storybook-codex-image-effort';
const IMAGE_EFFORTS = ['low', 'medium', 'high'] as const;
type ImageEffort = typeof IMAGE_EFFORTS[number];

function preferredImageEffort(): ImageEffort {
  const storedEffort = localStorage.getItem(EFFORT_STORAGE_KEY);
  return IMAGE_EFFORTS.find(effort => effort === storedEffort) || 'low';
}

export function CodexImageDialog({ request, onClose, onCreated }: CodexImageDialogProps) {
  const { t, i18n } = useTranslation();
  const [models, setModels] = useState<CodexModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedEffort, setSelectedEffort] = useState<ImageEffort>('low');
  const [instructions, setInstructions] = useState('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [result, setResult] = useState<CodexImageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [referencePageIndexes, setReferencePageIndexes] = useState<number[]>([]);
  const [generationPhase, setGenerationPhase] = useState<string | null>(null);
  const [generationDetail, setGenerationDetail] = useState<string | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const generationRequestId = useRef<string | null>(null);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    setModels([]);
    setSelectedModel('');
    setSelectedEffort(preferredImageEffort());
    setInstructions('');
    setResult(null);
    setError(null);
    setReferencePageIndexes(request.kind === 'create' ? request.initialReferencePageIndexes : []);
    setGenerationPhase(null);
    setGenerationDetail(null);
    setGenerationStartedAt(null);
    setElapsedSeconds(0);
    setIsLoadingModels(true);
    listCodexModels()
      .then(availableModels => {
        if (cancelled) return;
        setModels(availableModels);
        setSelectedModel(preferredCodexModel(availableModels, MODEL_STORAGE_KEY));
      })
      .catch(reason => {
        if (!cancelled) {
          setError(t('ai.imageModelListFailed', { error: localizeAppError(reason) }));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingModels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request, t]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<CodexImageProgress>('codex-image-progress', event => {
      if (event.payload.requestId === generationRequestId.current) {
        setGenerationPhase(event.payload.phase);
        setGenerationDetail(event.payload.detail || null);
      }
    }).then(stopListening => {
      unlisten = stopListening;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!isGenerating || generationStartedAt === null) return;
    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - generationStartedAt) / 1000)));
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [generationStartedAt, isGenerating]);

  const discardResult = async () => {
    if (!result) return;
    try {
      await invoke('discard_codex_image_variant', { generatedImage: result.filename });
    } catch {
      // The candidate is never shown in the project until it is applied.
    }
  };

  const close = () => {
    if (isGenerating || isApplying) return;
    void discardResult();
    onClose();
  };

  if (!request) return null;

  const redrawRequest = request.kind === 'redraw' ? request : null;
  const createRequest = request.kind === 'create' ? request : null;
  const isRedraw = redrawRequest !== null;
  const selectedModelInfo = models.find(option => option.model === selectedModel);
  const resultUrl = result ? `http://127.0.0.1:14320/generated-images/${result.filename}` : null;
  const formatTokenCount = (value: number) => new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language).format(value);
  const tokenUsageSummary = result ? (
    <section className="border-t border-border pt-3" aria-label={t('ai.imageTokenUsage')}>
      <p className="text-xs font-medium">{t('ai.imageTokenUsage')}</p>
      {result.usage ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          {[
            ['total', result.usage.totalTokens],
            ['input', result.usage.inputTokens],
            ['cachedInput', result.usage.cachedInputTokens],
            ['cacheWriteInput', result.usage.cacheWriteInputTokens],
            ['output', result.usage.outputTokens],
            ['reasoningOutput', result.usage.reasoningOutputTokens],
          ].map(([key, value]) => (
            <div key={key} className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">{t(`ai.imageTokenUsageFields.${key}`)}</dt>
              <dd className="font-medium tabular-nums">{formatTokenCount(value as number)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{t('ai.imageTokenUsageUnavailable')}</p>
      )}
    </section>
  ) : null;

  const generate = async () => {
    if (!selectedModel || !instructions.trim()) return;
    const requestId = crypto.randomUUID();
    setIsGenerating(true);
    setError(null);
    setGenerationPhase('preparing-request');
    setGenerationDetail(null);
    setGenerationStartedAt(Date.now());
    setElapsedSeconds(0);
    generationRequestId.current = requestId;
    localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
    localStorage.setItem(EFFORT_STORAGE_KEY, selectedEffort);
    try {
      const language = request.language;
      const proposal = redrawRequest
        ? await invoke<CodexImageResult>('redraw_image_with_codex', {
            sourceImage: redrawRequest.sourceImage,
            language,
            model: selectedModel,
            effort: selectedEffort,
            instructions: instructions.trim(),
            requestId,
          })
        : await invoke<CodexImageResult>('create_image_with_codex', {
            language,
            model: selectedModel,
            effort: selectedEffort,
            instructions: instructions.trim(),
            width: createRequest!.width,
            height: createRequest!.height,
            requestId,
            references: createRequest!.referencePages
              .filter(reference => referencePageIndexes.includes(reference.pageIndex))
              .map(({ pageIndex, image, script }) => ({ pageIndex, image, script })),
          });
      setResult(proposal);
    } catch (reason) {
      setError(t(isRedraw ? 'ai.imageRedrawFailed' : 'ai.imageCreateFailed', {
        error: localizeAppError(reason),
      }));
    } finally {
      generationRequestId.current = null;
      setIsGenerating(false);
      setGenerationStartedAt(null);
    }
  };

  const apply = async () => {
    if (!result || !request.expectedLastModified) return;
    setIsApplying(true);
    setError(null);
    try {
      if (redrawRequest) {
        await invoke('apply_codex_image_variant', {
          pageIndex: redrawRequest.pageIndex,
          expectedLastModified: redrawRequest.expectedLastModified,
          sourceImage: redrawRequest.sourceImage,
          generatedImage: result.filename,
        });
      } else {
        const pageIndex = await invoke<number>('append_codex_image', {
          expectedLastModified: request.expectedLastModified,
          generatedImage: result.filename,
        });
        onCreated(pageIndex);
      }
      setResult(null);
      onClose();
    } catch (reason) {
      setError(t(isRedraw ? 'ai.imageApplyFailed' : 'ai.imageCreateApplyFailed', {
        error: localizeAppError(reason),
      }));
    } finally {
      setIsApplying(false);
    }
  };

  const setupTitle = t(isRedraw ? 'ai.imageSetupTitle' : 'ai.imageCreateSetupTitle');
  const setupDescription = t(isRedraw ? 'ai.imageSetupDescription' : 'ai.imageCreateSetupDescription');
  const reviewTitle = t(isRedraw ? 'ai.imageReviewTitle' : 'ai.imageCreateReviewTitle');
  const reviewDescription = t(isRedraw ? 'ai.imageReviewDescription' : 'ai.imageCreateReviewDescription');
  const selectedReferenceCount = createRequest
    ? createRequest.referencePages.filter(reference => referencePageIndexes.includes(reference.pageIndex)).length
    : 0;

  const toggleReferencePage = (pageIndex: number) => {
    setReferencePageIndexes(current => {
      if (current.includes(pageIndex)) {
        return current.filter(index => index !== pageIndex);
      }
      if (current.length >= 4) return current;
      return [...current, pageIndex];
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="codex-image-dialog-title"
        className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-md border border-border bg-card shadow-2xl"
      >
        <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border px-4">
          <div>
            <h2 id="codex-image-dialog-title" className="text-sm font-semibold">
              {result ? reviewTitle : setupTitle}
            </h2>
            <p className="text-xs text-muted-foreground">
              {result ? reviewDescription : setupDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={isGenerating || isApplying}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            title={t('common.close')}
          >
            <X size={16} />
          </button>
        </header>

        {!result ? (
          <div className="flex flex-col gap-4 overflow-y-auto p-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="codex-image-model" className="text-xs font-medium">
                {t('ai.model')}
              </label>
              <select
                id="codex-image-model"
                value={selectedModel}
                onChange={event => setSelectedModel(event.target.value)}
                disabled={isLoadingModels || isGenerating || models.length === 0}
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

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-xs font-medium">{t('ai.imageEffort')}</legend>
              <div
                role="radiogroup"
                aria-label={t('ai.imageEffort')}
                className="grid h-9 grid-cols-3 overflow-hidden rounded border border-border"
              >
                {IMAGE_EFFORTS.map(effort => {
                  const isSelected = selectedEffort === effort;
                  return (
                    <button
                      key={effort}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedEffort(effort)}
                      disabled={isGenerating}
                      className={`border-r border-border text-xs transition-colors last:border-r-0 ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'} disabled:opacity-50`}
                    >
                      {t(`ai.imageEffortOptions.${effort}`)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {createRequest && createRequest.referencePages.length > 0 && (
              <fieldset className="flex flex-col gap-2 border-t border-border pt-3">
                <legend className="text-xs font-medium">{t('ai.imageReferencePages')}</legend>
                <p className="text-xs text-muted-foreground">{t('ai.imageReferencePagesHint')}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {createRequest.referencePages.map(reference => {
                    const selected = referencePageIndexes.includes(reference.pageIndex);
                    const unavailable = !selected && selectedReferenceCount >= 4;
                    return (
                      <label
                        key={reference.image}
                        className={`flex min-h-20 cursor-pointer gap-2 rounded border p-2 transition-colors ${selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'} ${unavailable ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={isGenerating || unavailable}
                          onChange={() => toggleReferencePage(reference.pageIndex)}
                          className="mt-1 h-3.5 w-3.5 accent-primary"
                        />
                        <img
                          src={reference.sourceImageUrl}
                          alt=""
                          className="h-14 w-14 flex-shrink-0 rounded border border-border object-cover"
                        />
                        <span className="min-w-0 text-xs">
                          <span className="block font-medium">{t('ai.imageReferencePage', { page: reference.pageIndex + 1 })}</span>
                          <span className="mt-0.5 block max-h-10 overflow-hidden text-muted-foreground">
                            {reference.script || t('ai.imageReferenceNoScript')}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="codex-image-instructions" className="text-xs font-medium">
                {t(isRedraw ? 'ai.imageInstructions' : 'ai.imageCreateInstructions')}
              </label>
              <textarea
                id="codex-image-instructions"
                value={instructions}
                onChange={event => setInstructions(event.target.value)}
                disabled={isGenerating}
                maxLength={20000}
                rows={5}
                placeholder={t(isRedraw ? 'ai.imageInstructionsPlaceholder' : 'ai.imageCreateInstructionsPlaceholder')}
                className="w-full resize-y rounded border border-border bg-background p-2.5 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>

            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              {t(isRedraw ? 'ai.imageDataNotice' : 'ai.imageCreateDataNotice')}
            </p>

            {error && (
              <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-500">
                <p>{error}</p>
                {generationPhase && (
                  <p className="mt-1 text-red-500/80">
                    {t('ai.imageLastProgress', {
                      phase: t(`ai.imageProgress.${generationPhase}`),
                      seconds: elapsedSeconds,
                    })}
                  </p>
                )}
              </div>
            )}
            {isGenerating && generationPhase && (
              <div role="status" className="flex items-center gap-2 rounded border border-primary/25 bg-primary/5 p-2 text-xs text-foreground">
                <Loader2 size={14} className="animate-spin text-primary" />
                <span>{t(`ai.imageProgress.${generationPhase}`)}</span>
                {generationDetail && <span className="min-w-0 truncate text-muted-foreground">{generationDetail}</span>}
                <span className="ml-auto text-muted-foreground">{t('ai.imageElapsed', { seconds: elapsedSeconds })}</span>
              </div>
            )}
          </div>
        ) : isRedraw ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-2">
            <div className="flex min-h-0 flex-col gap-2 border-b border-border p-4 md:border-b-0 md:border-r">
              <span className="text-xs font-medium">{t('ai.original')}</span>
              <div className="flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded border border-border bg-muted/30">
                <img src={redrawRequest!.sourceImageUrl} alt="" className="max-h-[52vh] max-w-full object-contain" />
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-2 p-4">
              <span className="text-xs font-medium">{t('ai.imageProposal')}</span>
              <div className="flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded border border-border bg-muted/30">
                {resultUrl && <img src={resultUrl} alt="" className="max-h-[52vh] max-w-full object-contain" />}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('ai.imageDimensions', { width: result.width, height: result.height })}
              </p>
              {tokenUsageSummary}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
            <span className="text-xs font-medium">{t('ai.imageProposal')}</span>
            <div className="flex min-h-[280px] flex-1 items-center justify-center overflow-hidden rounded border border-border bg-muted/30">
              {resultUrl && <img src={resultUrl} alt="" className="max-h-[58vh] max-w-full object-contain" />}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('ai.imageDimensions', { width: result.width, height: result.height })}
            </p>
            {tokenUsageSummary}
          </div>
        )}

        <footer className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={close}
            disabled={isGenerating || isApplying}
            className="h-8 rounded border border-border px-3 text-xs hover:bg-muted disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          {result ? (
            <button
              type="button"
              onClick={apply}
              disabled={isApplying}
              className="flex h-8 items-center gap-1.5 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isApplying ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {isApplying ? t('ai.imageApplying') : t(isRedraw ? 'ai.imageApply' : 'ai.imageCreateApply')}
            </button>
          ) : (
            <button
              type="button"
              onClick={generate}
              disabled={isGenerating || isLoadingModels || !selectedModel || !instructions.trim()}
              className="flex h-8 items-center gap-1.5 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {isGenerating ? t('ai.imageGenerating') : t(isRedraw ? 'ai.imageGenerate' : 'ai.imageCreateGenerate')}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
