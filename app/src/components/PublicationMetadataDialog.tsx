import { useEffect, useState } from 'react';
import { BookMarked, ExternalLink, Info, Plus, Trash2, X } from 'lucide-react';
import type {
  ProjectState,
  PublicationContributor,
  PublicationIdentifier,
  PublicationMetadata,
} from '../ProjectContext';
import { createPublicationMetadataDraft, normalizePublicationMetadata } from '../utils/publicationMetadata';
import {
  getPublicationLicensePreset,
  PUBLICATION_LICENSE_PRESETS,
  resolvePublicationLicensePreset,
  type PublicationLicensePresetId,
} from '../utils/publicationLicenses';

interface PublicationMetadataDialogProps {
  open: boolean;
  projectState: ProjectState;
  onClose: () => void;
  onSave: (metadata: PublicationMetadata | undefined) => void;
}

type MetadataTab = 'basic' | 'rights' | 'identifiers';

const inputClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary';
const labelClass = 'text-xs font-medium text-muted-foreground';

const CONTRIBUTOR_ROLES: Array<{ value: PublicationContributor['role']; label: string }> = [
  { value: 'author', label: '作者' },
  { value: 'illustrator', label: '绘者' },
  { value: 'editor', label: '编辑' },
  { value: 'translator', label: '译者' },
  { value: 'other', label: '其他' },
];

const IDENTIFIER_SCHEMES: PublicationIdentifier['scheme'][] = ['ISBN', 'DOI', 'URL', 'CUSTOM'];

export function PublicationMetadataDialog({
  open,
  projectState,
  onClose,
  onSave,
}: PublicationMetadataDialogProps) {
  const [activeTab, setActiveTab] = useState<MetadataTab>('basic');
  const [draft, setDraft] = useState<PublicationMetadata>(() => createPublicationMetadataDraft(projectState));
  const [keywordText, setKeywordText] = useState('');
  const [licensePresetId, setLicensePresetId] = useState<PublicationLicensePresetId>(() => (
    resolvePublicationLicensePreset(
      projectState.publication_metadata?.license_name,
      projectState.publication_metadata?.license_url,
    ).id
  ));

  useEffect(() => {
    if (!open) return;
    const nextDraft = createPublicationMetadataDraft(projectState);
    setDraft(nextDraft);
    setKeywordText(nextDraft.keywords?.join(', ') || '');
    setLicensePresetId(resolvePublicationLicensePreset(nextDraft.license_name, nextDraft.license_url).id);
    setActiveTab('basic');
  }, [open, projectState]);

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

  const updateDraft = (updates: Partial<PublicationMetadata>) => {
    setDraft(current => ({ ...current, ...updates }));
  };

  const updateContributor = (index: number, updates: Partial<PublicationContributor>) => {
    const contributors = [...(draft.contributors || [])];
    contributors[index] = { ...contributors[index], ...updates };
    updateDraft({ contributors });
  };

  const removeContributor = (index: number) => {
    updateDraft({ contributors: (draft.contributors || []).filter((_, itemIndex) => itemIndex !== index) });
  };

  const updateIdentifier = (index: number, updates: Partial<PublicationIdentifier>) => {
    const identifiers = [...(draft.identifiers || [])];
    identifiers[index] = { ...identifiers[index], ...updates };
    updateDraft({ identifiers });
  };

  const removeIdentifier = (index: number) => {
    updateDraft({ identifiers: (draft.identifiers || []).filter((_, itemIndex) => itemIndex !== index) });
  };

  const selectedLicense = getPublicationLicensePreset(licensePresetId);

  const selectLicense = (id: PublicationLicensePresetId) => {
    setLicensePresetId(id);
    if (id === 'custom') {
      if (licensePresetId !== 'custom') {
        updateDraft({ license_name: '', license_url: '' });
      }
      return;
    }

    const preset = getPublicationLicensePreset(id);
    updateDraft({
      license_name: preset.name,
      license_url: preset.url,
    });
  };

  const handleSave = () => {
    onSave(normalizePublicationMetadata({
      ...draft,
      keywords: keywordText.split(/[，,]/).map(keyword => keyword.trim()).filter(Boolean),
    }));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" onClick={onClose} role="presentation">
      <section
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publication-metadata-title"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <BookMarked size={18} className="text-primary" />
            <h2 id="publication-metadata-title" className="text-base font-semibold text-foreground">出版与版权</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="关闭" aria-label="关闭">
            <X size={16} />
          </button>
        </header>

        <div className="flex border-b border-border px-5">
          {([
            ['basic', '基本信息'],
            ['rights', '版权与许可'],
            ['identifiers', '标识符'],
          ] as Array<[MetadataTab, string]>).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-4 py-3 text-sm transition-colors ${activeTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'basic' && (
            <div className="grid gap-5">
              <label className="grid gap-1.5">
                <span className={labelClass}>作品标题</span>
                <input className={inputClass} value={draft.title || ''} onChange={event => updateDraft({ title: event.target.value })} />
              </label>

              <section className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className={labelClass}>创作者与参与者</span>
                  <button
                    type="button"
                    onClick={() => updateDraft({ contributors: [...(draft.contributors || []), { role: 'author', name: '' }] })}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary transition-colors hover:bg-muted"
                  >
                    <Plus size={13} /> 添加
                  </button>
                </div>
                {(draft.contributors || []).map((contributor, index) => (
                  <div key={`${contributor.role}-${index}`} className="grid grid-cols-[120px_1fr_32px] gap-2">
                    <select className={inputClass} value={contributor.role} onChange={event => updateContributor(index, { role: event.target.value as PublicationContributor['role'] })}>
                      {CONTRIBUTOR_ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                    </select>
                    <input className={inputClass} value={contributor.name} onChange={event => updateContributor(index, { name: event.target.value })} />
                    <button type="button" onClick={() => removeContributor(index)} className="flex h-9 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500" title="删除参与者" aria-label="删除参与者">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </section>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="grid gap-1.5">
                  <span className={labelClass}>语言</span>
                  <input className={inputClass} value={draft.language || ''} onChange={event => updateDraft({ language: event.target.value })} placeholder="zh-CN" />
                </label>
                <label className="grid gap-1.5">
                  <span className={labelClass}>出版者</span>
                  <input className={inputClass} value={draft.publisher || ''} onChange={event => updateDraft({ publisher: event.target.value })} />
                </label>
                <label className="grid gap-1.5">
                  <span className={labelClass}>发布日期</span>
                  <input type="date" className={inputClass} value={draft.publication_date || ''} onChange={event => updateDraft({ publication_date: event.target.value })} />
                </label>
              </div>

              <label className="grid gap-1.5">
                <span className={labelClass}>内容简介</span>
                <textarea className={`${inputClass} min-h-24 resize-y`} value={draft.description || ''} onChange={event => updateDraft({ description: event.target.value })} />
              </label>

              <label className="grid gap-1.5">
                <span className={labelClass}>关键词</span>
                <input className={inputClass} value={keywordText} onChange={event => setKeywordText(event.target.value)} placeholder="绘本, 儿童文学" />
              </label>
            </div>
          )}

          {activeTab === 'rights' && (
            <div className="grid gap-5">
              <section className="grid gap-2">
                <span className={labelClass}>版权页</span>
                <div className="grid grid-cols-3 overflow-hidden rounded-md border border-border">
                  {([
                    ['none', '不生成'],
                    ['electronic', '仅电子版'],
                    ['all', '电子与印刷版'],
                  ] as Array<[NonNullable<PublicationMetadata['copyright_page_mode']>, string]>).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateDraft({ copyright_page_mode: mode })}
                      className={`min-h-9 border-r border-border px-3 py-2 text-xs transition-colors last:border-r-0 ${
                        draft.copyright_page_mode === mode
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className={labelClass}>版权持有人</span>
                  <input className={inputClass} value={draft.copyright_holder || ''} onChange={event => updateDraft({ copyright_holder: event.target.value })} />
                </label>
                <label className="grid gap-1.5">
                  <span className={labelClass}>版权年份</span>
                  <input className={inputClass} value={draft.copyright_year || ''} onChange={event => updateDraft({ copyright_year: event.target.value })} inputMode="numeric" />
                </label>
              </div>

              <label className="grid gap-1.5">
                <span className={labelClass}>版权声明</span>
                <textarea className={`${inputClass} min-h-28 resize-y`} value={draft.copyright_notice || ''} onChange={event => updateDraft({ copyright_notice: event.target.value })} />
              </label>

              <section className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className={labelClass}>许可方式</span>
                  <select
                    className={inputClass}
                    value={selectedLicense.id}
                    onChange={event => selectLicense(event.target.value as PublicationLicensePresetId)}
                  >
                    {PUBLICATION_LICENSE_PRESETS.map(preset => (
                      <option key={preset.id} value={preset.id}>{preset.label}</option>
                    ))}
                  </select>
                </label>

                {selectedLicense.id === 'custom' && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className={labelClass}>自定义许可名称</span>
                      <input
                        className={inputClass}
                        value={draft.license_name || ''}
                        onChange={event => updateDraft({ license_name: event.target.value })}
                        placeholder="许可协议或权利声明"
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className={labelClass}>许可或权利声明 URL</span>
                      <input
                        type="url"
                        className={inputClass}
                        value={draft.license_url || ''}
                        onChange={event => updateDraft({ license_url: event.target.value })}
                        placeholder="https://"
                      />
                    </label>
                  </div>
                )}

                <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-muted/40 px-3 py-2.5">
                  <p className="text-xs leading-relaxed text-muted-foreground">{selectedLicense.summary}</p>
                  {selectedLicense.url && (
                    <a
                      href={selectedLicense.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                    >
                      官方条款
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>

                {(selectedLicense.kind === 'creative-commons' || selectedLicense.kind === 'public-domain') && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-foreground">
                    <Info size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p>
                      请确认你有权许可作品中的相关内容。开放许可一旦随作品分发，已经获得的授权通常不能撤回；电子 PDF 的权限限制也应与所选条款保持一致。
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'identifiers' && (
            <section className="grid gap-3">
              <div className="flex items-center justify-between">
                <span className={labelClass}>作品标识符</span>
                <button
                  type="button"
                  onClick={() => updateDraft({ identifiers: [...(draft.identifiers || []), { scheme: 'DOI', value: '' }] })}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary transition-colors hover:bg-muted"
                >
                  <Plus size={13} /> 添加
                </button>
              </div>
              {(draft.identifiers || []).map((identifier, index) => (
                <div key={`${identifier.scheme}-${index}`} className="grid grid-cols-[120px_1fr_32px] gap-2">
                  <select className={inputClass} value={identifier.scheme} onChange={event => updateIdentifier(index, { scheme: event.target.value as PublicationIdentifier['scheme'] })}>
                    {IDENTIFIER_SCHEMES.map(scheme => <option key={scheme} value={scheme}>{scheme === 'CUSTOM' ? '其他' : scheme}</option>)}
                  </select>
                  <input className={inputClass} value={identifier.value} onChange={event => updateIdentifier(index, { value: event.target.value })} />
                  <button type="button" onClick={() => removeIdentifier(index)} className="flex h-9 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500" title="删除标识符" aria-label="删除标识符">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </section>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted">取消</button>
          <button type="button" onClick={handleSave} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90">保存</button>
        </footer>
      </section>
    </div>
  );
}

interface MissingPublicationMetadataDialogProps {
  open: boolean;
  onClose: () => void;
  onConfigure: () => void;
  onContinue: () => void;
}

export function MissingPublicationMetadataDialog({ open, onClose, onConfigure, onContinue }: MissingPublicationMetadataDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4" onClick={onClose} role="presentation">
      <section className="w-full max-w-md rounded-lg border border-border bg-background shadow-2xl" onClick={event => event.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="missing-metadata-title">
        <header className="flex items-center gap-2 border-b border-border px-5 py-4">
          <BookMarked size={18} className="text-primary" />
          <h2 id="missing-metadata-title" className="text-base font-semibold text-foreground">出版信息尚未填写</h2>
        </header>
        <div className="px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          当前项目没有保存出版与版权信息。你可以先填写，也可以继续导出并使用项目标题和脚本作者作为基础元信息。
        </div>
        <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">取消</button>
          <button type="button" onClick={onContinue} className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted">仍然导出</button>
          <button type="button" onClick={onConfigure} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90">去填写</button>
        </footer>
      </section>
    </div>
  );
}
