import { useEffect, useState } from 'react';
import { Eye, ExternalLink, FileLock2, KeyRound, LockKeyhole, TriangleAlert, X } from 'lucide-react';
import type { ElectronicPdfSettings, PublicationMetadata } from '../ProjectContext';
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

const PRESET_OPTIONS: Array<{ value: ElectronicPdfPreset; label: string; description: string }> = [
  { value: 'screen', label: '屏幕发布', description: '禁止打印、复制和修改' },
  { value: 'personal', label: '个人阅读', description: '允许低清打印' },
  { value: 'open', label: '开放阅读', description: '不加密，允许复制和打印' },
];

const inputClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-50';

export function ElectronicPdfExportDialog({
  open,
  settings,
  publicationMetadata,
  onClose,
  onExport,
}: ElectronicPdfExportDialogProps) {
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
        setPasswordError('打开密码至少需要 6 个字符。');
        return;
      }
      if (openPassword !== confirmPassword) {
        setPasswordError('两次输入的密码不一致。');
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
            <h2 id="electronic-pdf-export-title" className="text-base font-semibold text-foreground">电子 PDF 发布</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="关闭" aria-label="关闭">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">发布方式</span>
            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-border">
              {PRESET_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectPreset(option.value)}
                  className={`min-h-16 border-r border-border px-3 py-2 text-left transition-colors last:border-r-0 ${
                    draft.preset === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className={`mt-0.5 block text-[11px] leading-snug ${draft.preset === option.value ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LockKeyhole size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">AES-256 权限加密</span>
              </div>
              <input
                type="checkbox"
                checked={draft.encryption_enabled}
                onChange={event => updateDraft({ encryption_enabled: event.target.checked })}
                className="h-4 w-4 accent-primary"
                aria-label="启用 AES-256 权限加密"
              />
            </div>

            <div className={`grid gap-3 rounded-md border border-border p-4 ${restrictionsDisabled ? 'opacity-50' : ''}`}>
              <label className="grid grid-cols-[1fr_190px] items-center gap-4">
                <span className="text-sm text-foreground">打印</span>
                <select
                  className={inputClass}
                  value={draft.printing}
                  onChange={event => updateDraft({ printing: event.target.value as ResolvedElectronicPdfSettings['printing'] })}
                  disabled={restrictionsDisabled}
                >
                  <option value="none">不允许</option>
                  <option value="low_resolution">仅低清打印</option>
                  <option value="high_quality">允许高质量打印</option>
                </select>
              </label>
              {([
                ['allow_copying', '复制文本与图像'],
                ['allow_modification', '修改与页面编排'],
                ['allow_annotations', '批注与填写表单'],
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
                需要密码打开
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
                  placeholder="打开密码"
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
                  placeholder="再次输入"
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
                  当前作品使用 {publicationLicense.label}，但 PDF 正在限制访问、打印、复制或修改。附加技术限制可能与开放许可授予的权利冲突。
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => selectPreset('open')}
                    className="font-medium text-primary hover:underline"
                  >
                    改为开放阅读
                  </button>
                  <a
                    href={publicationLicense.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    查看许可条款
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <Eye size={15} className="mt-0.5 shrink-0" />
            PDF 权限用于表达发布者的使用限制，不等同于 DRM，也不能阻止截图或被专用工具绕过。打开密码不会保存到项目文件。
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted">取消</button>
          <button type="button" onClick={handleExport} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90">选择位置并导出</button>
        </footer>
      </section>
    </div>
  );
}
