import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import type { ImageImportResult, ImportedImage } from './localImageImport';

interface ImportSummary {
  added: number;
  duplicates: number;
  trashed: number;
}

export interface ImportFeedback extends ImportSummary {
  failures: ImageImportResult['failures'];
  error?: string;
}

function isTextTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
  ));
}

export function useLocalImageImport({ workspaceId, enabled, onImported, dialogTitle }: {
  workspaceId: string | null;
  enabled: boolean;
  onImported: (images: ImportedImage[]) => ImportSummary;
  dialogTitle: string;
}) {
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null);
  const context = useRef({ workspaceId, enabled, onImported, dialogTitle });
  const running = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    context.current = { workspaceId, enabled, onImported, dialogTitle };
  }, [workspaceId, enabled, onImported, dialogTitle]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async (
    operation: (workspace: string) => Promise<ImageImportResult | null>,
    quietIfEmpty = false,
  ) => {
    const initial = context.current;
    if (!initial.enabled || !initial.workspaceId || running.current) return;
    const workspace = initial.workspaceId;
    running.current = true;
    setDragging(false);
    setBusy(true);
    setFeedback(null);
    try {
      const result = await operation(workspace);
      if (!result || !mounted.current || context.current.workspaceId !== workspace) return;
      const summary = context.current.onImported(result.images);
      setFeedback({ ...summary, failures: result.failures });
    } catch (error) {
      if (!mounted.current || context.current.workspaceId !== workspace) return;
      const message = String(error);
      if (!quietIfEmpty || message !== 'IMAGE_IMPORT_CLIPBOARD_EMPTY') {
        setFeedback({ added: 0, duplicates: 0, trashed: 0, failures: [], error: message });
      }
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  const importFiles = useCallback((paths: string[]) => run(workspace => (
    invoke<ImageImportResult>('import_local_images', { workspaceId: workspace, paths })
  )), [run]);

  const chooseFiles = useCallback(() => run(async workspace => {
    const paths = await open({
      title: context.current.dialogTitle,
      multiple: true,
      filters: [{ name: context.current.dialogTitle, extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'] }],
    });
    if (!paths || (Array.isArray(paths) && paths.length === 0)) return null;
    if (!mounted.current || context.current.workspaceId !== workspace) return null;
    return invoke<ImageImportResult>('import_local_images', {
      workspaceId: workspace,
      paths: typeof paths === 'string' ? [paths] : paths,
    });
  }), [run]);

  const pasteImage = useCallback((quietIfEmpty = false) => run(workspace => (
    invoke<ImageImportResult>('import_clipboard_image', { workspaceId: workspace })
  ), quietIfEmpty), [run]);

  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    getCurrentWebview().onDragDropEvent(event => {
      if (event.payload.type === 'leave' || event.payload.type === 'drop') setDragging(false);
      if (!context.current.enabled || running.current) return;
      if (event.payload.type === 'enter') setDragging(true);
      if (event.payload.type === 'drop') void importFiles(event.payload.paths);
    }).then(unlisten => {
      if (disposed) unlisten();
      else stop = unlisten;
    }).catch(error => console.error('Could not listen for image drops', error));
    return () => { disposed = true; stop?.(); };
  }, [importFiles]);

  useEffect(() => {
    const canPaste = (target: EventTarget | null) => (
      context.current.enabled && !isTextTarget(target) && !document.querySelector('[aria-modal="true"], [role="dialog"]')
    );
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'v'
          && canPaste(event.target)) {
        event.preventDefault();
        if (!event.repeat) void pasteImage(true);
      }
    };
    const paste = (event: ClipboardEvent) => {
      if (!canPaste(event.target) || event.clipboardData?.types.includes('text/plain')) return;
      event.preventDefault();
      void pasteImage(true);
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('paste', paste);
    };
  }, [pasteImage]);

  return { busy, dragging, feedback, chooseFiles, pasteImage, dismissFeedback: () => setFeedback(null) };
}
