import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Info, X } from 'lucide-react';
import { APP_LICENSE_NOTICE, FONT_LICENSE_NOTICES } from '../utils/licenseNotices';

interface LicenseNoticeButtonProps {
  compact?: boolean;
  className?: string;
}

export function LicenseNoticeButton({ compact = false, className = '' }: LicenseNoticeButtonProps) {
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
        title="许可与致谢"
        aria-label="许可与致谢"
      >
        <Info size={compact ? 14 : 16} />
        {!compact && <span>许可与致谢</span>}
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
                  许可与致谢
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="关闭"
                title="关闭"
              >
                <X size={16} />
              </button>
            </header>

            <div className="overflow-y-auto px-5 py-4">
              <section className="border-b border-border pb-4">
                <h3 className="text-sm font-semibold text-foreground">{APP_LICENSE_NOTICE.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  应用本体：{APP_LICENSE_NOTICE.license}，完整文本见发行包内的{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{APP_LICENSE_NOTICE.licenseFile}</code>。
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{APP_LICENSE_NOTICE.note}</p>
              </section>

              <section className="pt-4">
                <h3 className="text-sm font-semibold text-foreground">内置字体</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  以下字体随应用本地打包，用于编辑预览和 PDF 导出。完整许可证文本已随应用和发布产物一起提供。
                </p>

                <div className="mt-4 flex flex-col gap-3">
                  {FONT_LICENSE_NOTICES.map((notice) => (
                    <article key={notice.id} className="rounded-md border border-border bg-card p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">
                            {notice.label}
                            <span className="ml-2 text-xs text-muted-foreground">{notice.name}</span>
                          </h4>
                          <p className="text-xs text-muted-foreground">{notice.license}</p>
                        </div>
                        <a
                          href={notice.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          上游来源
                          <ExternalLink size={12} />
                        </a>
                      </div>

                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                        <div>
                          资源：<code className="break-all rounded bg-muted px-1 py-0.5">{notice.bundledFiles}</code>
                        </div>
                        <div>
                          许可证：<code className="break-all rounded bg-muted px-1 py-0.5">{notice.licenseFile}</code>
                        </div>
                      </div>

                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-foreground hover:text-primary">
                          查看许可证全文
                        </summary>
                        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
                          {notice.licenseText}
                        </pre>
                      </details>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
