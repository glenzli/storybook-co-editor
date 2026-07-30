import { useEffect, useState } from 'react';
import { Eye, ExternalLink, FileLock2, KeyRound, LockKeyhole, TriangleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ElectronicPdfSettings, PublicationMetadata } from '../project/model';
import {
  getElectronicPdfPreset,
  resolveElectronicPdfSettings,
  toPersistedElectronicPdfSettings,
  type ElectronicPdfExportSecrets,
  type ElectronicPdfPreset,
  type ResolvedElectronicPdfSettings,
} from '../utils/electronicPdfSettings';
import {
  isOpenPublicationLicense,
  PUBLICATION_LICENSE_TRANSLATION_KEYS,
  resolveProjectPublicationLicense,
} from '../utils/publicationLicenses';

export type { ElectronicPdfExportSecrets } from '../utils/electronicPdfSettings';

interface ElectronicPdfExportDialogProps {
  open: boolean;
  settings: ElectronicPdfSettings | undefined;
  publicationMetadata: PublicationMetadata | undefined;
  onClose: () => void;
  onExport: (settings: ElectronicPdfSettings, secrets: ElectronicPdfExportSecrets) => void;
}

const PRESET_OPTIONS: ElectronicPdfPreset[] = ['screen', 'personal', 'open'];

const inputClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-50';

export function ElectronicPdfExportDialog({
  open,
  settings,
  publicationMetadata,
  onClose,
  onExport,
}: ElectronicPdfExportDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ResolvedElectronicPdfSettings>(() => resolveElectronicPdfSettings(settings));
  const [requireOpenPassword, setRequireOpenPassword] = useState(false);
  const [openPassword, setOpenPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(resolveElectronicPdfSettings(settings));
    setRequireOpenPassword(false);
    setOpenPassword('');
    setConfirmPassword('');
    setPasswordError('');
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  const updateDraft = (updates: Partial<ResolvedElectronicPdfSettings>) => {
    setDraft(current => ({ ...current, ...updates, preset: 'custom' }));
  };

  const selectPreset = (preset: ElectronicPdfPreset) => {
    setDraft(getElectronicPdfPreset(preset));
    if (preset === 'open') {
      setRequireOpenPassword(false);
      setOpenPassword('');
      setConfirmPassword('');
      setPasswordError('');
    }
  };

  const handleExport = () => {
    if (draft.encryption_enabled && requireOpenPassword) {
      if (openPassword.length < 6) {
        setPasswordError(t('electronicPdf.passwordTooShort'));
        return;
      }
      if (openPassword !== confirmPassword) {
        setPasswordError(t('electronicPdf.passwordMismatch'));
        return;
      }
    }

    onExport(
      toPersistedElectronicPdfSettings(draft),
      { openPassword: draft.encryption_enabled && requireOpenPassword ? openPassword : undefined },
    );
  };

  const restrictionsDisabled = !draft.encryption_enabled;
  const publicationLicense = resolveProjectPublicationLicense(publicationMetadata);
  const hasLicenseConflict = isOpenPublicationLicense(publicationLicense)
    && draft.encryption_enabled
    && (
      requireOpenPassword
      || draft.printing !== 'high_quality'
      || !draft.allow_copying
      || !draft.allow_modification
      || !draft.allow_annotations
    );

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/45 p-4" onClick={onClose} role="presentation">
      <section
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="electronic-pdf-export-title"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <FileLock2 size={18} className="text-primary" />
            <h2 id="electronic-pdf-export-title" className="text-base font-semibold text-foreground">{t('electronicPdf.title')}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title={t('common.close')} aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t('electronicPdf.method')}</span>
            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-border">
              {PRESET_OPTIONS.map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => selectPreset(option)}
                  className={`min-h-16 border-r border-border px-3 py-2 text-left transition-colors last:border-r-0 ${
                    draft.preset === option
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  <span className="block text-sm font-medium">{t(`electronicPdf.presets.${option}.label`)}</span>
                  <span className={`mt-0.5 block text-[11px] leading-snug ${draft.preset === option ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>
                    {t(`electronicPdf.presets.${option}.description`)}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LockKeyhole size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{t('electronicPdf.encryption')}</span>
              </div>
              <input
                type="checkbox"
                checked={draft.encryption_enabled}
                onChange={event => updateDraft({ encryption_enabled: event.target.checked })}
                className="h-4 w-4 accent-primary"
                aria-label={t('electronicPdf.enableEncryption')}
              />
            </div>

            <div className={`grid gap-3 rounded-md border border-border p-4 ${restrictionsDisabled ? 'opacity-50' : ''}`}>
              <label className="grid grid-cols-[1fr_190px] items-center gap-4">
                <span className="text-sm text-foreground">{t('electronicPdf.printing')}</span>
                <select
                  className={inputClass}
                  value={draft.printing}
                  onChange={event => updateDraft({ printing: event.target.value as ResolvedElectronicPdfSettings['printing'] })}
                  disabled={restrictionsDisabled}
                >
                  <option value="none">{t('electronicPdf.printingOptions.none')}</option>
                  <option value="low_resolution">{t('electronicPdf.printingOptions.lowResolution')}</option>
                  <option value="high_quality">{t('electronicPdf.printingOptions.highQuality')}</option>
                </select>
              </label>
              {([
                ['allow_copying', t('electronicPdf.allowCopying')],
                ['allow_modification', t('electronicPdf.allowModification')],
                ['allow_annotations', t('electronicPdf.allowAnnotations')],
              ] as Array<[keyof Pick<ResolvedElectronicPdfSettings, 'allow_copying' | 'allow_modification' | 'allow_annotations'>, string]>).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-foreground">{label}</span>
                  <input
                    type="checkbox"
                    checked={draft[key]}
                    onChange={event => updateDraft({ [key]: event.target.checked })}
                    disabled={restrictionsDisabled}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className={`grid gap-3 ${restrictionsDisabled ? 'opacity-50' : ''}`}>
            <label className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <KeyRound size={16} className="text-muted-foreground" />
                {t('electronicPdf.requirePassword')}
              </span>
              <input
                type="checkbox"
                checked={requireOpenPassword}
                onChange={event => {
                  setRequireOpenPassword(event.target.checked);
                  setPasswordError('');
                }}
                disabled={restrictionsDisabled}
                className="h-4 w-4 accent-primary"
              />
            </label>
            {draft.encryption_enabled && requireOpenPassword && (
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="password"
                  autoComplete="new-password"
                  className={inputClass}
                  value={openPassword}
                  onChange={event => {
                    setOpenPassword(event.target.value);
                    setPasswordError('');
                  }}
                  placeholder={t('electronicPdf.password')}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  className={inputClass}
                  value={confirmPassword}
                  onChange={event => {
                    setConfirmPassword(event.target.value);
                    setPasswordError('');
                  }}
                  placeholder={t('electronicPdf.confirmPassword')}
                />
              </div>
            )}
            {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
          </section>

          {hasLicenseConflict && (
            <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-xs leading-relaxed text-foreground">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 flex-1">
                <p>
                  {t('electronicPdf.licenseConflict', {
                    license: t(`publication.licenses.${PUBLICATION_LICENSE_TRANSLATION_KEYS[publicationLicense.id]}.label`),
                  })}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => selectPreset('open')}
                    className="font-medium text-primary hover:underline"
                  >
                    {t('electronicPdf.switchToOpen')}
                  </button>
                  <a
                    href={publicationLicense.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {t('electronicPdf.viewLicense')}
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <Eye size={15} className="mt-0.5 shrink-0" />
            {t('electronicPdf.limitations')}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted">{t('common.cancel')}</button>
          <button type="button" onClick={handleExport} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90">{t('electronicPdf.chooseLocation')}</button>
        </footer>
      </section>
    </div>
  );
}
