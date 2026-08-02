import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { Image as TauriImage } from '@tauri-apps/api/image';
import { Image as ImageIcon, Info, XOctagon, RefreshCw, Trash2, ArchiveRestore, ZoomIn } from 'lucide-react';
import { getPaletteSync } from 'colorthief';
import { useTranslation } from 'react-i18next';
import { useProject } from './ProjectContext';
import type { ElectronicPdfSettings, ProjectState } from './project/model';
import { ProImage } from './components/ProImage';
import { arrayMove } from '@dnd-kit/sortable';
import { createLogger } from './utils/logger';
import PrintScreen from './PrintScreen';
import { EditorHeader } from './components/EditorHeader';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';
import { PageImageContextMenu, type PageImageMenuTarget } from './components/PageImageContextMenu';
import { AiIntegrationDialog } from './components/ai/AiIntegrationDialog';
import { CodexImageDialog, type CodexImageRequest } from './components/ai/CodexImageDialog';
import { useCodexAvailability } from './components/ai/codexModels';
import { getFontFamilyStack, waitForProjectFonts } from './utils/fonts';
import { StoryTextOverlay } from './components/StoryTextOverlay';
import {
  buildStoryPages,
  getDefaultExportFilename,
  getStrokeColor,
} from './utils/storyPageRenderer';
import { hasStoryTitle, parseStoryScript } from './story/script';
import {
  generateElectronicPdf,
  getElectronicPdfPageCount,
  type ElectronicPdfProgress,
} from './utils/electronicPdf';
import {
  MissingPublicationMetadataDialog,
  PublicationMetadataDialog,
} from './components/PublicationMetadataDialog';
import { hasPublicationMetadata } from './utils/publicationMetadata';
import { ElectronicPdfExportDialog } from './components/ElectronicPdfExportDialog';
import type { ElectronicPdfExportSecrets } from './utils/electronicPdfSettings';
import { writeElectronicPdf } from './utils/pdfExportFinalizer';
import { localizeAppError } from './i18n';
import {
  createMoveMapping,
  remapMovedIndex,
  remapPageIndexedState,
  type PageIndexMapping,
} from './editor/pageCollection';
import { usePluginReceive, type SavedImageEvent } from './editor/usePluginReceive';
import { subscribeExternalProjectUpdates } from './project/externalUpdates';

const logger = createLogger('App');

export default function EditorScreen() {
  const { t } = useTranslation();
  const isCodexAvailable = useCodexAvailability();
  const { activeWorkspaceId, projectState, updateProjectState, appendSourceUrlMap, saveProject, saveProjectAs, closeProject, currentProjectPath, isDirty, undo, redo, canUndo, canRedo, isSaving, saveProgress } = useProject();
  const [images, setImages] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  
  // Trash & Project State
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [trashedImages, setTrashedImages] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  
  // Theme
  const [isDark, setIsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Sidebar States
  const [isLeftOpen, setIsLeftOpen] = useState(() => localStorage.getItem('isLeftOpen') !== 'false');
  const [isRightOpen, setIsRightOpen] = useState(() => localStorage.getItem('isRightOpen') !== 'false');

  useEffect(() => {
    localStorage.setItem('isLeftOpen', String(isLeftOpen));
  }, [isLeftOpen]);

  useEffect(() => {
    localStorage.setItem('isRightOpen', String(isRightOpen));
  }, [isRightOpen]);


  // Tabs
  const [activeTab, setActiveTab] = useState<'edit' | 'print'>('edit');
  const [electronicPdfProgress, setElectronicPdfProgress] = useState<ElectronicPdfProgress | null>(null);
  const [isElectronicPdfExportOpen, setIsElectronicPdfExportOpen] = useState(false);
  const [isPublicationMetadataOpen, setIsPublicationMetadataOpen] = useState(false);
  const [isMissingMetadataPromptOpen, setIsMissingMetadataPromptOpen] = useState(false);
  const [isAiIntegrationOpen, setIsAiIntegrationOpen] = useState(false);
  const [codexImageRequest, setCodexImageRequest] = useState<CodexImageRequest | null>(null);
  const [canvasContextMenu, setCanvasContextMenu] = useState<PageImageMenuTarget | null>(null);
  const pendingPdfExportRef = useRef<(() => void) | null>(null);



  // Selected Image Metadata
  const [imgMeta, setImgMeta] = useState<{ width: number, height: number, sizeMB: string } | null>(null);

  // Canvas & Viewport
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const authorTextRef = useRef<HTMLDivElement>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [xyBounds, setXyBounds] = useState({ minX: -500, maxX: 500, minY: -500, maxY: 500 });
  const [authorBounds, setAuthorBounds] = useState({ minX: -500, maxX: 500, minY: -500, maxY: 40 });
  const [extractedColors, setExtractedColors] = useState<string[]>([]);



  const defaultScript = t('editor.defaultScript');

  const [globalScript, setGlobalScript] = useState(defaultScript);
  const publicationProjectState = useMemo(
    () => projectState ? { ...projectState, global_script: globalScript } : null,
    [projectState, globalScript],
  );

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    invoke<string[]>('get_system_fonts').then(fonts => {
      setSystemFonts(fonts);
    }).catch(e => logger.error("Failed to fetch system fonts", e));
  }, []);

  useEffect(() => {
    waitForProjectFonts(projectState).catch(e => logger.warn("Failed to preload project fonts", e));
  }, [projectState]);

  useEffect(() => {
    if (projectState) {
        const urls = projectState.visible_images.map((f: string) => f.startsWith('blank://') ? f : `http://127.0.0.1:14320/images/${f}`);
        const trashUrls = projectState.trashed_images.map((f: string) => f.startsWith('blank://') ? f : `http://127.0.0.1:14320/images/${f}`);
        setImages(urls);
        setTrashedImages(trashUrls);
        if (projectState.global_script) {
            setGlobalScript(projectState.global_script);
        }
        if (urls.length > 0 && selectedIdx === null) setSelectedIdx(0);
        setIsLoaded(true);
        
        // Auto-detect canvas size from first image if still at default
        if (urls.length > 0 && projectState.canvas_width === 1024 && projectState.canvas_height === 1024) {
            const img = new Image();
            img.onload = () => {
                if (img.naturalWidth !== 1024 || img.naturalHeight !== 1024) {
                    updateProjectState({ canvas_width: img.naturalWidth, canvas_height: img.naturalHeight });
                }
            };
            img.src = urls[0];
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]); // Run once when workspace changes

  useEffect(() => subscribeExternalProjectUpdates(update => {
    if (update.workspace_id !== activeWorkspaceId) return;
    const urls = update.state.visible_images.map(filename => (
      filename.startsWith('blank://') ? filename : `http://127.0.0.1:14320/images/${filename}`
    ));
    const trashUrls = update.state.trashed_images.map(filename => (
      filename.startsWith('blank://') ? filename : `http://127.0.0.1:14320/images/${filename}`
    ));
    setImages(urls);
    setTrashedImages(trashUrls);
    setGlobalScript(update.state.global_script);
    setSelectedIdx(current => {
      if (urls.length === 0) return null;
      if (current === null) return 0;
      return Math.min(current, urls.length - 1);
    });
  }), [activeWorkspaceId]);

  // Sync project state
  useEffect(() => {
      if (!isLoaded) return;
      const tid = setTimeout(() => {
        updateProjectState({
            visible_images: images.map(url => url.startsWith('blank://') ? url : url.split('/').pop()!),
            trashed_images: trashedImages.map(url => url.startsWith('blank://') ? url : url.split('/').pop()!),
            global_script: globalScript
        });
      }, 500);
      return () => clearTimeout(tid);
  }, [images, trashedImages, globalScript, isLoaded, updateProjectState]);

  // Load Image Metadata when selectedIdx changes
  useEffect(() => {
    if (selectedIdx === null || !images[selectedIdx]) {
        setImgMeta(null);
        return;
    }
    const url = images[selectedIdx];
    
    // Fetch size using HEAD request
    fetch(url, { method: 'HEAD' })
      .then(res => {
          const length = res.headers.get('content-length');
          let sizeMB = "Unknown";
          if (length) {
              sizeMB = (parseInt(length) / (1024 * 1024)).toFixed(2) + " MB";
          }
          
          // Fetch dimensions using Image object
          const img = new Image();
          img.onload = () => {
              setImgMeta({ width: img.naturalWidth, height: img.naturalHeight, sizeMB });
          };
          img.src = url;
      })
      .catch(() => setImgMeta(null));
  }, [selectedIdx, images]);

  // Extract dominant colors from current image
  useEffect(() => {
    if (selectedIdx === null || !images[selectedIdx]) {
      setExtractedColors([]);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const palette = getPaletteSync(img, { colorCount: 8 });
        if (palette) {
          const hexColors = palette.map(c => c.hex());
          setExtractedColors([...new Set(hexColors)]);
        }
      } catch {
        setExtractedColors([]);
      }
    };
    img.src = images[selectedIdx];
  }, [selectedIdx, images]);

  const parsedStory = useMemo(() => parseStoryScript(globalScript), [globalScript]);
  const parsedAuthor = parsedStory.author;
  const storyPages = useMemo(() => {
    if (!projectState) return [];
    return buildStoryPages({ ...projectState, global_script: globalScript }, images);
  }, [globalScript, images, projectState]);

  // Compute text overlay info for thumbnails — Cover/Title only
  const textOverlays = useMemo(() => {
    const result: Record<number, import('./components/SortableImageItem').TextOverlayInfo[]> = {};

    storyPages.filter(page => page.role !== 'body').forEach(page => {
      if (page.textLayers.length === 0) return;
      result[page.index] = page.textLayers.map(layer => ({
        text: layer.text,
        color: layer.color,
        fontSize: layer.fontSize,
        fontFamily: getFontFamilyStack(layer.fontFamily),
        hasShadow: layer.hasShadow,
        hasBackdrop: layer.hasBackdrop,
        strokeColor: getStrokeColor(layer.color),
        offsetX: layer.offsetX,
        offsetY: layer.offsetY,
      }));
    });

    return result;
  }, [storyPages]);

  const selectedPage = selectedIdx !== null ? storyPages[selectedIdx] : undefined;
  const currentText = selectedPage?.textLayers.find(layer => layer.id === 'main')?.text || '';

  // Measure viewport and compute canvas scale
  const canvasW = projectState?.canvas_width || 1024;
  const canvasH = projectState?.canvas_height || 1024;
  
  useEffect(() => {
    const measure = () => {
      if (!viewportRef.current) return;
      const style = getComputedStyle(viewportRef.current);
      const padL = parseFloat(style.paddingLeft) || 0;
      const padR = parseFloat(style.paddingRight) || 0;
      const padT = parseFloat(style.paddingTop) || 0;
      const padB = parseFloat(style.paddingBottom) || 0;
      const availW = viewportRef.current.clientWidth - padL - padR;
      const availH = viewportRef.current.clientHeight - padT - padB;
      const S = Math.min(availW / canvasW, availH / canvasH);
      setCanvasScale(S);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [canvasW, canvasH]);

  // Dynamic bounds logic — now in canvas coordinates
  useEffect(() => {
    if (!textRef.current || selectedIdx === null) return;
    
    const measureBounds = () => {
        if (!textRef.current) return;
        // Text dimensions are in canvas coords (CSS transform doesn't affect scrollWidth/Height
        // of the element itself, since transform is on the parent)
        const Tw = textRef.current.scrollWidth;
        const Th = textRef.current.scrollHeight;
        
        // Max offset based on canvas and text dimensions
        const maxOffset = Math.max(0, (canvasW - Tw) / 2);
        const minY = -(canvasH - 40 - Th);
        const maxY = 40;
        
        setXyBounds({
            minX: -Math.floor(maxOffset),
            maxX: Math.floor(maxOffset),
            minY: Math.floor(minY),
            maxY: Math.floor(maxY)
        });

        if (authorTextRef.current) {
            const aTw = authorTextRef.current.scrollWidth;
            const aTh = authorTextRef.current.scrollHeight;
            const maxAuthorOffset = Math.max(0, (canvasW - aTw) / 2);
            const minAuthorY = -(canvasH - 40 - aTh);
            setAuthorBounds({
                minX: -Math.floor(maxAuthorOffset),
                maxX: Math.floor(maxAuthorOffset),
                minY: Math.floor(minAuthorY),
                maxY: 40
            });
        }
    };

    measureBounds();
    const ro = new ResizeObserver(measureBounds);
    ro.observe(textRef.current);
    if (authorTextRef.current) {
        ro.observe(authorTextRef.current);
    }
    
    return () => ro.disconnect();
  }, [selectedIdx, currentText, parsedAuthor, canvasW, canvasH, projectState?.cover_text_settings?.font_size, projectState?.inner_text_settings?.font_size, projectState?.author_text_settings?.font_size]);


  const shiftProjectDictionaries = useCallback((mapping: PageIndexMapping, numItems: number) => {
    if (!projectState) return;
    updateProjectState(remapPageIndexedState(projectState, numItems, mapping));
  }, [projectState, updateProjectState]);

  const movePage = useCallback((from: number, to: number) => {
    setImages(items => {
      if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) {
        return items;
      }
      const mapping = createMoveMapping(from, to);
      setSelectedIdx(previous => previous === null ? null : remapMovedIndex(previous, from, to));
      shiftProjectDictionaries(mapping, items.length);
      return arrayMove(items, from, to);
    });
  }, [shiftProjectDictionaries]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = images.indexOf(String(event.active.id));
    const to = images.indexOf(String(event.over.id));
    movePage(from, to);
  }, [images, movePage]);

  const handleMoveToTop = useCallback((index: number) => {
    movePage(index, 0);
  }, [movePage]);

  const handleMoveToBottom = useCallback((index: number) => {
    movePage(index, images.length - 1);
  }, [images.length, movePage]);

  const performElectronicPdfExport = useCallback(async (
    electronicPdfSettings: ElectronicPdfSettings,
    secrets: ElectronicPdfExportSecrets,
  ) => {
    if (!projectState || electronicPdfProgress) return;

    const exportState: ProjectState = {
      ...projectState,
      global_script: globalScript,
      visible_images: images.map(source => (
        source.startsWith('blank://') ? source : source.split('/').pop()!
      )),
      electronic_pdf_settings: electronicPdfSettings,
    };

    if (exportState.visible_images.length === 0) {
      alert(t('export.noPages'));
      return;
    }

    try {
      const filePath = await save({
        filters: [{ name: t('common.pdfDocument'), extensions: ['pdf'] }],
        defaultPath: `${getDefaultExportFilename(exportState, t('export.electronicSuffix'))}.pdf`,
      });
      if (!filePath) return;

      setElectronicPdfProgress({ current: 0, total: getElectronicPdfPageCount(exportState) });
      await waitForProjectFonts(exportState);
      const pdfBytes = await generateElectronicPdf(exportState, setElectronicPdfProgress);
      await writeElectronicPdf(filePath, pdfBytes, electronicPdfSettings, secrets);
      alert(t('export.electronicSuccess', { path: filePath }));
    } catch (error) {
      logger.error('Electronic PDF export failed', error);
      alert(t('export.electronicFailure', { error: localizeAppError(error) }));
    } finally {
      setElectronicPdfProgress(null);
    }
  }, [electronicPdfProgress, globalScript, images, projectState, t]);

  const requestPdfExport = useCallback((exportAction: () => void) => {
    if (!projectState) return;
    if (!hasPublicationMetadata(projectState.publication_metadata)) {
      pendingPdfExportRef.current = exportAction;
      setIsMissingMetadataPromptOpen(true);
      return;
    }
    exportAction();
  }, [projectState]);

  const handleExportElectronicPdf = useCallback(() => {
    if (electronicPdfProgress) return;
    requestPdfExport(() => setIsElectronicPdfExportOpen(true));
  }, [electronicPdfProgress, requestPdfExport]);

  const handleExportImage = useCallback(async (id: string, idx: number) => {
      if (id.startsWith('blank://')) {
          alert(t('export.blankPageExport'));
          return;
      }
      try {
          const ext = id.split('.').pop()?.toLowerCase() || 'jpg';
          const defaultPath = `page_${idx}.${ext}`;
          const filePath = await save({
              filters: [{ name: t('common.imageFile'), extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
              defaultPath
          });
          if (filePath) {
              const res = await fetch(id.startsWith('http') ? id : `http://127.0.0.1:14320/images/${id}`);
              const blob = await res.blob();
              const arrayBuffer = await blob.arrayBuffer();
              await writeFile(filePath, new Uint8Array(arrayBuffer));
          }
      } catch(e) {
          console.error("Failed to export image", e);
          alert(t('export.imageFailure', { error: localizeAppError(e) }));
      }
  }, [t]);

  const handleCopyToClipboard = useCallback(async (id: string) => {
      if (id.startsWith('blank://')) {
          alert(t('export.blankPageCopy'));
          return;
      }
      try {
          const imgUrl = id.startsWith('http') ? id : `http://127.0.0.1:14320/images/${id}`;
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = imgUrl;
          await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
          });
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error(t('errors.canvasUnavailable'));
          ctx.drawImage(img, 0, 0);
          
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          // Convert Uint8ClampedArray to Uint8Array for Tauri API compatibility
          const rgba = new Uint8Array(imgData.data.buffer);
          
          try {
              const tauriImg = await TauriImage.new(rgba, canvas.width, canvas.height);
              await writeImage(tauriImg);
          } catch (err) {
              console.error("Tauri clipboard write failed:", err);
              alert(t('export.clipboardPermissionFailure'));
          }
      } catch(e) {
          console.error("Failed to copy image", e);
          alert(t('export.copyFailure', { error: localizeAppError(e) }));
      }
  }, [t]);

  const handleDelete = useCallback((idToRemove: string) => {
      setTrashedImages(prev => {
          if (idToRemove.startsWith('blank://')) return prev;
          if (!prev.includes(idToRemove)) return [...prev, idToRemove];
          return prev;
      });
      
      setImages(prev => {
          const idx = prev.indexOf(idToRemove);
          const next = prev.filter(url => url !== idToRemove);
          
          setSelectedIdx(currentSelectedIdx => {
              if (currentSelectedIdx === idx) {
                  return next.length > 0 ? 0 : null;
              } else if (currentSelectedIdx !== null && currentSelectedIdx > idx) {
                  return currentSelectedIdx - 1;
              }
              return currentSelectedIdx;
          });

          shiftProjectDictionaries((i) => {
              if (i === idx) return null; // deleted
              if (i > idx) return i - 1; // shifted left
              return i;
          }, prev.length);
          
          return next;
      });
  }, [shiftProjectDictionaries]);

  const handleOpenTrash = () => {
      setShowTrashModal(true);
  };

  const handleRestoreTrash = (idToRestore: string) => {
      setImages(prev => [...prev, idToRestore]);
      setTrashedImages(prev => prev.filter(url => url !== idToRestore));
  };



  const imagesLengthRef = useRef(0);
  useEffect(() => {
      imagesLengthRef.current = images.length;
  }, [images.length]);

  const selectedIdxRef = useRef<number | null>(selectedIdx);
  useEffect(() => {
    selectedIdxRef.current = selectedIdx;
  }, [selectedIdx]);

  const shiftProjectDictionariesRef = useRef(shiftProjectDictionaries);
  useEffect(() => {
    shiftProjectDictionariesRef.current = shiftProjectDictionaries;
  }, [shiftProjectDictionaries]);

  const handleReceivedImage = useCallback((event: SavedImageEvent) => {
    const { filepath, stable_id: stableId } = event;
    const url = `http://127.0.0.1:14320/images/${filepath}`;

    if (stableId) appendSourceUrlMap(stableId, filepath);

    setTrashedImages(currentTrash => {
      if (currentTrash.includes(url)) {
        logger.info('Image is in frontend trash pool, ignoring', url);
        return currentTrash;
      }

      setImages(previous => {
        if (previous.includes(url)) return previous;
        if (!event.insert_after_current || selectedIdxRef.current === null) {
          return [...previous, url];
        }

        const targetIndex = selectedIdxRef.current + 1;
        const next = [...previous];
        next.splice(targetIndex, 0, url);
        setTimeout(() => {
          shiftProjectDictionariesRef.current(index => (
            index >= targetIndex ? index + 1 : index
          ), previous.length);
        }, 0);
        return next;
      });

      setSelectedIdx(previous => {
        if (previous === null) return 0;
        if (event.insert_after_current && selectedIdxRef.current !== null) {
          return selectedIdxRef.current + 1;
        }
        return previous;
      });

      return currentTrash;
    });
  }, [appendSourceUrlMap]);

  const { receivingState, cancelReceive } = usePluginReceive(handleReceivedImage);

  // Keyboard shortcuts: Cmd+S, Cmd+Z, Cmd+Shift+Z, Arrow keys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in input fields
      const activeElement = document.activeElement as HTMLElement;
      if (
          activeElement?.tagName === 'INPUT' || 
          activeElement?.tagName === 'TEXTAREA' || 
          activeElement?.isContentEditable
      ) {
          return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (isDirty && !isSaving) {
          saveProject();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedIdx(prev => {
            const next = (prev !== null && prev > 0) ? prev - 1 : prev;
            if (next !== null) {
                setTimeout(() => document.getElementById(`sidebar-item-${next}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10);
            }
            return next;
        });
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedIdx(prev => {
            const next = (prev !== null && prev < imagesLengthRef.current - 1) ? prev + 1 : prev;
            if (next !== null) {
                setTimeout(() => document.getElementById(`sidebar-item-${next}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10);
            }
            return next;
        });
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [isDirty, isSaving, saveProject, undo, redo]);
  const handleInsertBlankPage = () => {
    setImages(prev => {
        const next = [...prev, `blank://${Date.now()}`];
        setSelectedIdx(next.length - 1);
        return next;
    });
  };

  const openCodexCreate = useCallback(() => {
    if (!isCodexAvailable || !projectState) return;
    const referencePages = projectState.visible_images
      .map((image, pageIndex) => ({
        pageIndex,
        image,
        sourceImageUrl: images[pageIndex],
        script: parsedStory.pageText.get(pageIndex) || '',
      }))
      .filter(reference => !reference.image.startsWith('blank://') && Boolean(reference.sourceImageUrl));
    const selectedReference = referencePages.find(reference => reference.pageIndex === selectedIdx)
      || referencePages[referencePages.length - 1];
    setCodexImageRequest({
      kind: 'create',
      width: canvasW,
      height: canvasH,
      expectedLastModified: projectState.last_modified,
      referencePages,
      initialReferencePageIndexes: selectedReference ? [selectedReference.pageIndex] : [],
    });
  }, [canvasH, canvasW, images, isCodexAvailable, parsedStory.pageText, projectState, selectedIdx]);

  const openCodexRedraw = useCallback((id: string, index: number) => {
    if (!isCodexAvailable || !projectState || id.startsWith('blank://')) return;
    const sourceImage = id.split('/').pop();
    if (!sourceImage) return;
    setSelectedIdx(index);
    setCodexImageRequest({
      kind: 'redraw',
      pageIndex: index,
      sourceImage,
      sourceImageUrl: id,
      expectedLastModified: projectState.last_modified,
    });
  }, [isCodexAvailable, projectState]);

  useEffect(() => {
    if (!canvasContextMenu) return;
    const dismiss = () => setCanvasContextMenu(null);
    document.addEventListener('click', dismiss);
    return () => document.removeEventListener('click', dismiss);
  }, [canvasContextMenu]);


  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden transition-colors duration-300">
      
      {/* Top Menu Bar */}
      <EditorHeader
        projectState={projectState}
        isDirty={isDirty}
        currentProjectPath={currentProjectPath}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        saveProject={saveProject}
        saveProjectAs={saveProjectAs}
        closeProject={closeProject}
        isSaving={isSaving}
        saveProgress={saveProgress}
        exportElectronicPdf={handleExportElectronicPdf}
        electronicPdfProgress={electronicPdfProgress}
        openPublicationMetadata={() => setIsPublicationMetadataOpen(true)}
        hasPublicationMetadata={hasPublicationMetadata(projectState?.publication_metadata)}
        openAiIntegration={() => setIsAiIntegrationOpen(true)}
      />

      {/* Main Area */}
      {activeTab === 'edit' ? (
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left Sidebar: Pages/Thumbnails */}
          <LeftSidebar
            isLeftOpen={isLeftOpen}
            setIsLeftOpen={setIsLeftOpen}
            images={images}
            selectedIdx={selectedIdx}
            setSelectedIdx={setSelectedIdx}
            isCodexAvailable={isCodexAvailable}
            isDark={isDark}
            setIsDark={setIsDark}
            handleDelete={handleDelete}
            handleMoveToTop={handleMoveToTop}
            handleMoveToBottom={handleMoveToBottom}
            handleExportImage={handleExportImage}
            handleCopyToClipboard={handleCopyToClipboard}
            handleOpenTrash={handleOpenTrash}
            handleDragEnd={handleDragEnd}
            handleInsertBlank={handleInsertBlankPage}
            handleInsertCodex={openCodexCreate}
            handleRedraw={openCodexRedraw}
            hasTitle={hasStoryTitle(projectState?.global_script || '')}
            imageAdjustments={projectState?.image_adjustments}
            textOverlays={textOverlays}
            canvasSize={canvasW}
          />
          {/* Center: Main Canvas */}
          <main ref={viewportRef} className="flex-1 bg-muted relative flex items-center justify-center p-8 overflow-hidden">
            {selectedIdx !== null && images[selectedIdx] ? (
              <div style={{
                width: `${canvasW * canvasScale}px`,
                height: `${canvasH * canvasScale}px`,
              }}>
                <div 
                  ref={containerRef}
                  className="relative shadow-2xl ring-1 ring-border/50 bg-background/50 backdrop-blur-3xl rounded-sm"
                  style={{
                    width: `${canvasW}px`,
                    height: `${canvasH}px`,
                    transform: `scale(${canvasScale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <div className="absolute inset-0 overflow-hidden rounded-sm flex items-center justify-center">
                    {selectedPage && (() => {
                      const imageLayer = selectedPage.image;
                      const isTransparent = imageLayer.backgroundColor === 'transparent';
                      const transparentBgStyle = {
                        backgroundImage: 'linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)',
                        backgroundSize: '20px 20px',
                        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                        backgroundColor: '#ffffff'
                      };
                      return (
                        <div
                          className="absolute inset-0 flex items-center justify-center transition-colors"
                          style={isTransparent ? transparentBgStyle : { backgroundColor: imageLayer.backgroundColor }}
                          onContextMenu={event => {
                            event.preventDefault();
                            const source = selectedIdx === null ? null : images[selectedIdx];
                            if (!source || selectedIdx === null) return;
                            setCanvasContextMenu({
                              x: event.clientX,
                              y: event.clientY,
                              id: source,
                              index: selectedIdx,
                            });
                          }}
                        >
                          <div className="relative w-full h-full" style={{ transform: `translate(${imageLayer.offsetX}%, ${imageLayer.offsetY}%) scale(${imageLayer.scale})` }}>
                            <ProImage 
                              src={imageLayer.source}
                              className={`w-full h-full object-contain ${imageLayer.source.startsWith('blank://') ? 'bg-white' : ''}`}
                              adjustments={imageLayer.adjustments}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  {selectedPage?.textLayers.map(layer => (
                    <StoryTextOverlay
                      key={layer.id}
                      layer={layer}
                      textRef={layer.id === 'main' ? textRef : authorTextRef}
                      interactive
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground flex flex-col items-center gap-4">
                <ImageIcon size={64} className="opacity-30" />
                <p className="text-lg">{t('editor.waitingForArtwork')}</p>
              </div>
            )}
          </main>

          {canvasContextMenu && (
            <PageImageContextMenu
              target={canvasContextMenu}
              pageCount={images.length}
              isCodexAvailable={isCodexAvailable}
              onDismiss={() => setCanvasContextMenu(null)}
              onRedraw={openCodexRedraw}
              onCopy={handleCopyToClipboard}
              onExport={handleExportImage}
              onDelete={handleDelete}
            />
          )}

          <RightSidebar
            isRightOpen={isRightOpen}
            setIsRightOpen={setIsRightOpen}
            projectState={projectState}
            updateProjectState={updateProjectState}
            globalScript={globalScript}
            setGlobalScript={setGlobalScript}
            imgMeta={imgMeta}
            canvasW={canvasW}
            canvasH={canvasH}
            selectedIdx={selectedIdx}
            setSelectedIdx={setSelectedIdx}
            selectedImage={selectedIdx === null ? null : images[selectedIdx] || null}
            isCodexAvailable={isCodexAvailable}
            onRedrawImage={() => {
              if (selectedIdx === null || !images[selectedIdx]) return;
              openCodexRedraw(images[selectedIdx], selectedIdx);
            }}
            systemFonts={systemFonts}
            extractedColors={extractedColors}
            xyBounds={xyBounds}
            authorBounds={authorBounds}
          />
      </div>
      ) : (
        <PrintScreen requestPdfExport={requestPdfExport} />
      )}

      <AiIntegrationDialog
        open={isAiIntegrationOpen}
        onClose={() => setIsAiIntegrationOpen(false)}
      />

      <CodexImageDialog
        request={codexImageRequest}
        onClose={() => setCodexImageRequest(null)}
        onCreated={pageIndex => setSelectedIdx(pageIndex)}
      />

      {/* Bottom Status Bar */}
      <footer className="h-10 bg-card border-t border-border flex items-center justify-between px-4 text-xs flex-shrink-0 relative z-20">
          <div className="flex items-center gap-4 text-muted-foreground">
             {imgMeta ? (
                 <>
                    <span className="flex items-center gap-1"><Info size={14}/> {imgMeta.width} × {imgMeta.height}</span>
                    <span>{imgMeta.sizeMB}</span>
                 </>
             ) : (
                 <span>{t('editor.ready')}</span>
             )}
             {activeTab === 'edit' && (
               <div className="flex items-center gap-2 ml-4 border-l border-border pl-4">
                 <ZoomIn size={14} className="text-muted-foreground" />
                 <input 
                   type="range" 
                   min="10" max="200" step="1"
                   value={Math.round(canvasScale * 100)}
                   onChange={(e) => setCanvasScale(parseInt(e.target.value) / 100)}
                   className="w-20 accent-primary"
                 />
                 <span className="font-mono w-10 text-right">{Math.round(canvasScale * 100)}%</span>
                 <button 
                   className="text-muted-foreground hover:text-foreground transition-colors px-1"
                   onClick={() => {
                     // Reset to auto-fit
                     if (viewportRef.current) {
                       const style = getComputedStyle(viewportRef.current);
                       const padL = parseFloat(style.paddingLeft) || 0;
                       const padR = parseFloat(style.paddingRight) || 0;
                       const padT = parseFloat(style.paddingTop) || 0;
                       const padB = parseFloat(style.paddingBottom) || 0;
                       const availW = viewportRef.current.clientWidth - padL - padR;
                       const availH = viewportRef.current.clientHeight - padT - padB;
                       setCanvasScale(Math.min(availW / canvasW, availH / canvasH));
                     }
                   }}
                   title={t('editor.fitWindow')}
                 >
                   {t('editor.fit')}
                 </button>
               </div>
             )}
          </div>
          
          <div className="flex items-center gap-4">
              {receivingState.active && (
                  <div className="flex items-center gap-3 bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
                      <span className="font-bold flex items-center gap-2">
                          <RefreshCw size={12} className="animate-spin" />
                          {t('editor.receivingImages', {
                            current: receivingState.current,
                            total: receivingState.total,
                          })}
                      </span>
                      <button onClick={cancelReceive} className="hover:text-red-500 transition-colors ml-2" title={t('editor.cancelReceive')}>
                          <XOctagon size={14} />
                      </button>
                  </div>
              )}
              <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground/80">
                  <span className="font-bold text-foreground/50">STORYBOOK CO-EDITOR v1.3.0</span>
                  <span>{t('editor.bridgeConnected')}</span>
              </div>
          </div>
      </footer>

      {/* Trash Modal Overlay */}
      {showTrashModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-8">
          <div className="bg-card border border-border shadow-2xl rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <div className="flex items-center gap-2 text-red-500">
                <Trash2 size={20} />
                <h2 className="font-bold text-lg">{t('editor.trashWithCount', { count: trashedImages.length })}</h2>
              </div>
              <button onClick={() => setShowTrashModal(false)} className="p-2 hover:bg-muted rounded-full" title={t('editor.closeTrash')} aria-label={t('editor.closeTrash')}>
                <XOctagon size={20} className="text-muted-foreground" />
              </button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              {trashedImages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('editor.trashEmpty')}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-4">
                  {trashedImages.map((url) => (
                    <div key={url} className="relative group rounded-lg overflow-hidden border border-border">
                      <img src={url} alt="Trashed" className="w-full aspect-square object-cover opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all" />
                      <button 
                        onClick={() => handleRestoreTrash(url)}
                        className="absolute inset-0 m-auto w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                        title={t('editor.restoreImage')}
                      >
                        <ArchiveRestore size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {publicationProjectState && (
        <PublicationMetadataDialog
          open={isPublicationMetadataOpen}
          projectState={publicationProjectState}
          onClose={() => setIsPublicationMetadataOpen(false)}
          onSave={(publicationMetadata) => updateProjectState({ publication_metadata: publicationMetadata })}
        />
      )}

      <ElectronicPdfExportDialog
        open={isElectronicPdfExportOpen}
        settings={projectState?.electronic_pdf_settings}
        publicationMetadata={projectState?.publication_metadata}
        onClose={() => setIsElectronicPdfExportOpen(false)}
        onExport={(settings, secrets) => {
          setIsElectronicPdfExportOpen(false);
          updateProjectState({ electronic_pdf_settings: settings });
          void performElectronicPdfExport(settings, secrets);
        }}
      />

      <MissingPublicationMetadataDialog
        open={isMissingMetadataPromptOpen}
        onClose={() => {
          pendingPdfExportRef.current = null;
          setIsMissingMetadataPromptOpen(false);
        }}
        onConfigure={() => {
          pendingPdfExportRef.current = null;
          setIsMissingMetadataPromptOpen(false);
          setIsPublicationMetadataOpen(true);
        }}
        onContinue={() => {
          const exportAction = pendingPdfExportRef.current;
          pendingPdfExportRef.current = null;
          setIsMissingMetadataPromptOpen(false);
          exportAction?.();
        }}
      />

    </div>
  );
}
