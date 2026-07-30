import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  APP_LICENSE_NOTICE,
  DEPENDENCY_LICENSE_NOTICES,
  FONT_LICENSE_NOTICES,
  type FontLicenseNotice,
} from '../utils/licenseNotices';

interface LicenseNoticeButtonProps {
  compact?: boolean;
  className?: string;
}

const NOTICE_TRANSLATION_KEYS: Record<string, string> = {
  lopdf: 'lopdf',
  'lxgw-wenkai': 'lxgwWenkai',
  'smiley-sans': 'smileySans',
  'zcool-qingke-huangyou': 'zcoolQingKeHuangYou',
  'zcool-xiaowei': 'zcoolXiaoWei',
  'zcool-kuaile': 'zcoolKuaiLe',
  'noto-serif-sc': 'notoSerifSc',
  'noto-sans-sc': 'notoSansSc',
};

function LicenseNoticeCards({ notices }: { notices: FontLicenseNotice[] }) {
  const { t } = useTranslation();

  return (
    <div className="mt-4 flex flex-col gap-3">
      {notices.map((notice) => {
        const localizedLabel = t(`notices.items.${NOTICE_TRANSLATION_KEYS[notice.id]}`, {
          defaultValue: notice.label,
        });
        const bundledFiles = notice.id === 'lopdf'
          ? t('notices.lopdfBundledFiles')
          : notice.bundledFiles;
        const showUpstreamName = !localizedLabel.toLocaleLowerCase().includes(
          notice.name.toLocaleLowerCase(),
        );

        return (
          <article key={notice.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="text-sm font-medium text-foreground">
                  {localizedLabel}
                  {showUpstreamName && (
                    <span className="ml-2 text-xs text-muted-foreground">{notice.name}</span>
                  )}
                </h4>
                <p className="text-xs text-muted-foreground">{notice.license}</p>
              </div>
              <a
                href={notice.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {t('notices.upstream')}
                <ExternalLink size={12} />
              </a>
            </div>

            <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
              <div>
                {t('notices.assets')} <code className="break-all rounded bg-muted px-1 py-0.5">{bundledFiles}</code>
              </div>
              <div>
                {t('notices.license')} <code className="break-all rounded bg-muted px-1 py-0.5">{notice.licenseFile}</code>
              </div>
            </div>

            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-foreground hover:text-primary">
                {t('notices.viewLicense')}
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
                {notice.licenseText}
              </pre>
            </details>
          </article>
        );
      })}
    </div>
  );
}

export function LicenseNoticeButton({ compact = false, className = '' }: LicenseNoticeButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`${compact ? 'p-1.5 rounded-md' : 'inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm'} transition-colors ${className}`}
        title={t('notices.title')}
        aria-label={t('notices.title')}
      >
        <Info size={compact ? 14 : 16} />
        {!compact && <span>{t('notices.title')}</span>}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          onClick={() => setIsOpen(false)}
          role="presentation"
        >
          <section
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="license-notice-title"
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-primary" />
                <h2 id="license-notice-title" className="text-base font-semibold text-foreground">
                  {t('notices.title')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('common.close')}
                title={t('common.close')}
              >
                <X size={16} />
              </button>
            </header>

            <div className="overflow-y-auto px-5 py-4">
              <section className="border-b border-border pb-4">
                <h3 className="text-sm font-semibold text-foreground">{APP_LICENSE_NOTICE.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('notices.appLicense', {
                    license: APP_LICENSE_NOTICE.license,
                    file: APP_LICENSE_NOTICE.licenseFile,
                  })}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{t('notices.appNote')}</p>
              </section>

              <section className="pt-4">
                <h3 className="text-sm font-semibold text-foreground">{t('notices.dependencies')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('notices.dependenciesDescription')}
                </p>
                <LicenseNoticeCards notices={DEPENDENCY_LICENSE_NOTICES} />
              </section>

              <section className="mt-5 border-t border-border pt-4">
                <h3 className="text-sm font-semibold text-foreground">{t('notices.bundledFonts')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('notices.bundledFontsDescription')}
                </p>

                <LicenseNoticeCards notices={FONT_LICENSE_NOTICES} />
              </section>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
