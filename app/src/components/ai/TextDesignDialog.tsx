import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { listCodexModels, type CodexModelOption } from './codexModels';
import type { StoryPage, StoryTextLayer } from '../../utils/storyPageRenderer';
import { generateCandidates, prepareArtwork, refinedLayer, renderCandidate, fitsPage,
  type DesignReview, type TextCandidate } from '../../text-design/candidates';

interface Props {
  page: StoryPage;
  stale: boolean;
  aiAvailable: boolean;
  onClose: () => void;
  onApply: (layer: StoryTextLayer) => void;
}

export function TextDesignDialog({ page, stale, aiAvailable, onClose, onApply }: Props) {
  const { t, i18n } = useTranslation();
  const [lockPosition, setLockPosition] = useState(true);
  const [candidates, setCandidates] = useState<TextCandidate[]>([]);
  const [models, setModels] = useState<CodexModelOption[]>([]);
  const [model, setModel] = useState('');
  const [selected, setSelected] = useState('current');
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [preferred, setPreferred] = useState<string[]>([]);
  const [tokens, setTokens] = useState<number | null>(null);
  const artwork = useRef<HTMLCanvasElement | null>(null);
  const generation = useRef(0);
  const requestId = useRef<string | null>(null);
  const current = candidates.find(c => c.id === selected);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    const counter = generation;
    return () => {
      active.current = false; counter.current++;
      if (requestId.current) void invoke('cancel_text_design', { requestId: requestId.current }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!aiAvailable) return;
    let cancelled = false;
    listCodexModels().then(options => {
      if (cancelled) return;
      setModels(options);
      const stored = localStorage.getItem('storybook-text-design-model');
      setModel(options.find(m => m.model === stored)?.model || options.find(m => m.model === 'gpt-5.6-luna')?.model || options[0]?.model || '');
    }).catch(() => { if (!cancelled) setError(t('textDesign.modelError')); });
    return () => { cancelled = true; };
  }, [aiAvailable, t]);

  const cancel = () => {
    generation.current++;
    if (requestId.current) void invoke('cancel_text_design', { requestId: requestId.current }).catch(() => {});
    requestId.current = null; setBusy('');
  };
  const generate = async () => {
    const version = ++generation.current;
    setBusy(t('textDesign.generating')); setError(''); setNotes(''); setPreferred([]); setTokens(null);
    try {
      const image = artwork.current || await prepareArtwork(page);
      if (!active.current || version !== generation.current) return;
      artwork.current = image;
      const result = generateCandidates(page, image, lockPosition);
      setCandidates(result); setSelected(result[1]?.id || 'current');
      if (result.length < 2) setNotes(t('textDesign.noFit'));
    } catch { if (active.current && version === generation.current) setError(t('textDesign.generateError')); }
    finally { if (active.current && version === generation.current) setBusy(''); }
  };
  const review = async () => {
    if (!model || !artwork.current) return;
    const version = ++generation.current;
    setError(''); setNotes(''); setPreferred([]); setTokens(null);
    localStorage.setItem('storybook-text-design-model', model);
    let working = candidates.slice(0, 6), usage = 0, hasUsage = false;
    try {
      for (let round = 1; round <= 2; round++) {
        setBusy(t('textDesign.reviewing', { round }));
        const id = crypto.randomUUID(); requestId.current = id;
        // Reverse the second round so a retained winner has no fixed presentation advantage.
        const ordered = round === 2 ? [...working].reverse() : working;
        const result = await invoke<DesignReview & { total_tokens: number | null }>('review_text_design', {
          requestId: id, model, story: page.textLayers.map(l => l.text).join('\n'), language: i18n.language,
          candidates: ordered.map(c => ({ id: c.id, preview: c.preview, detail: c.detail })),
        });
        if (!active.current || version !== generation.current) return;
        requestId.current = null;
        if (result.total_tokens !== null) { usage += result.total_tokens; hasUsage = true; setTokens(usage); }
        const displayNotes = working.reduce((text, candidate, index) => text.split(candidate.id).join(
          candidate.original ? t('textDesign.original') : t('textDesign.candidate', { number: index })), result.notes);
        setPreferred(result.preferred); setNotes(displayNotes || t('textDesign.noRecommendation'));
        if (result.preferred[0]) setSelected(result.preferred[0]);
        const target = working.find(c => c.id === result.target);
        if (round === 2 || result.refinement === 'none' || !target || result.preferred.length === 0) break;
        const layer = refinedLayer(target.layer, result.refinement);
        const ctx = document.createElement('canvas').getContext('2d')!;
        if (!fitsPage(ctx, page, layer)) break;
        const refined = renderCandidate(page, artwork.current!, layer, `refined-${crypto.randomUUID()}`);
        const keepIds = new Set(['current', ...result.preferred]);
        working = [...working.filter(c => keepIds.has(c.id)), refined];
        setCandidates(working);
      }
      if (!hasUsage) setTokens(null);
    } catch { if (active.current && version === generation.current) setError(t('textDesign.reviewError')); }
    finally { if (active.current && version === generation.current) { requestId.current = null; setBusy(''); } }
  };

  return <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-labelledby="text-design-title"
    onKeyDown={e => { if (e.key === 'Escape') { cancel(); onClose(); } }}>
    <div className="bg-background rounded-xl border shadow-xl w-full max-w-6xl max-h-[92vh] flex flex-col">
      <div className="p-4 border-b flex justify-between items-center">
        <div><h2 id="text-design-title" className="font-semibold">{t('textDesign.open')}</h2><p className="text-xs text-muted-foreground mt-1">{t('textDesign.description')}</p></div>
        <button type="button" className="border rounded px-3 py-1" onClick={() => { cancel(); onClose(); }}>{t('common.close')}</button>
      </div>
      <div className="p-4 flex flex-wrap gap-3 items-center border-b text-sm">
        <label className="flex gap-2"><input type="checkbox" checked={lockPosition} disabled={!!busy} onChange={e => setLockPosition(e.target.checked)} />{t('textDesign.lockPosition')}</label>
        <button type="button" className="border rounded px-3 py-2 disabled:opacity-40" disabled={!!busy || stale} onClick={generate}>{t('textDesign.generate')}</button>
        <select aria-label={t('ai.model')} className="bg-background border rounded p-2 max-w-52" value={model} disabled={!!busy || !aiAvailable} onChange={e => setModel(e.target.value)}>
          {!models.length && <option value="">{t('textDesign.modelPlaceholder')}</option>}
          {models.map(m => <option key={m.model} value={m.model}>{m.displayName}</option>)}
        </select>
        <button type="button" className="border rounded px-3 py-2 disabled:opacity-40" disabled={!!busy || stale || !aiAvailable || !model || candidates.length < 2} onClick={review}>{t('textDesign.review')}</button>
        {busy && <button type="button" className="border rounded px-3 py-2" onClick={cancel}>{t('common.cancel')}</button>}
      </div>
      <div className="overflow-auto flex-1 p-4">
        <div aria-live="polite" className="text-sm mb-3 space-y-2">
          {busy && <p>{busy}</p>}{error && <p className="text-red-500">{error}</p>}
          {stale && <p className="text-amber-600">{t('textDesign.stale')}</p>}
          {notes && <p className="whitespace-pre-wrap">{notes}</p>}
          {tokens !== null && <p className="text-xs text-muted-foreground">{t('textDesign.tokens', { count: tokens })}</p>}
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {candidates.map((candidate, i) => <button type="button" key={candidate.id} onClick={() => setSelected(candidate.id)}
            className={`rounded border-2 overflow-hidden text-xs ${selected === candidate.id ? 'border-primary' : 'border-border'}`}>
            <img src={candidate.preview} alt={candidate.original ? t('textDesign.original') : t('textDesign.candidate', { number: i })} className="w-full aspect-square object-contain bg-white" />
            <span className="block p-2">{candidate.original ? t('textDesign.original') : t('textDesign.candidate', { number: i })}{preferred.includes(candidate.id) ? ` · ${t('textDesign.recommended')}` : ''}</span>
          </button>)}
        </div>
        {current && <div className="mt-4 grid grid-cols-2 gap-4">
          <img src={current.preview} alt={t('textDesign.fullPage')} className="w-full max-h-[40vh] object-contain bg-white rounded" />
          <img src={current.detail} alt={t('textDesign.detail')} className="w-full max-h-[40vh] object-contain bg-white rounded" />
        </div>}
        {!candidates.length && <p className="text-center p-12 text-muted-foreground">{t('textDesign.start')}</p>}
      </div>
      <div className="border-t p-4 flex justify-between items-center text-sm"><span className="text-muted-foreground">{t('textDesign.applyHint')}</span>
        <button type="button" className="bg-primary text-primary-foreground rounded px-4 py-2 disabled:opacity-40" disabled={!current || current.original || !!busy || stale}
          onClick={() => { if (current && !stale) onApply(current.layer); }}>{t('textDesign.apply')}</button>
      </div>
    </div>
  </div>;
}
