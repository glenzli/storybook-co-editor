import { ArrowDownToLine, ArrowUpToLine, Copy, Download, Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface PageImageMenuTarget {
  x: number;
  y: number;
  id: string;
  index: number;
}

interface PageImageContextMenuProps {
  target: PageImageMenuTarget;
  pageCount: number;
  isCodexAvailable: boolean;
  onDismiss: () => void;
  onRedraw: (id: string, index: number) => void;
  onCopy: (id: string, index: number) => void;
  onExport: (id: string, index: number) => void;
  onDelete: (id: string) => void;
  onMoveToTop?: (index: number) => void;
  onMoveToBottom?: (index: number) => void;
}

export function PageImageContextMenu({
  target,
  pageCount,
  isCodexAvailable,
  onDismiss,
  onRedraw,
  onCopy,
  onExport,
  onDelete,
  onMoveToTop,
  onMoveToBottom,
}: PageImageContextMenuProps) {
  const { t } = useTranslation();
  const canRedraw = isCodexAvailable && !target.id.startsWith('blank://');
  const left = Math.max(8, Math.min(target.x, window.innerWidth - 204));
  const top = Math.max(8, Math.min(target.y, window.innerHeight - 240));
  const showOrdering = onMoveToTop && onMoveToBottom;

  const run = (action: () => void) => {
    action();
    onDismiss();
  };

  return (
    <div
      role="menu"
      className="fixed z-[100] min-w-[196px] rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-lg"
      style={{ left, top }}
    >
      {showOrdering && (
        <>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
            disabled={target.index === 0}
            onClick={() => run(() => onMoveToTop?.(target.index))}
          >
            <ArrowUpToLine size={14} />
            {t('sidebar.moveTop')}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
            disabled={target.index === pageCount - 1}
            onClick={() => run(() => onMoveToBottom?.(target.index))}
          >
            <ArrowDownToLine size={14} />
            {t('sidebar.moveBottom')}
          </button>
          <div className="my-1 h-px bg-border" />
        </>
      )}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-primary transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canRedraw}
        title={!isCodexAvailable ? t('ai.codexUnavailable') : undefined}
        onClick={() => run(() => onRedraw(target.id, target.index))}
      >
        <Sparkles size={14} />
        {t('ai.redrawImage')}
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted"
        onClick={() => run(() => onCopy(target.id, target.index))}
      >
        <Copy size={14} />
        {t('sidebar.copyImage')}
      </button>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted"
        onClick={() => run(() => onExport(target.id, target.index))}
      >
        <Download size={14} />
        {t('sidebar.exportOriginal')}
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-500 transition-colors hover:bg-red-500/10"
        onClick={() => run(() => onDelete(target.id))}
      >
        <Trash2 size={14} />
        {t('common.delete')}
      </button>
    </div>
  );
}
