import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { Image as TauriImage } from '@tauri-apps/api/image';
import { Image as ImageIcon, Info, XOctagon, RefreshCw, Trash2, ArchiveRestore, ZoomIn } from 'lucide-react';
import { getPaletteSync } from 'colorthief';
import {
  useProject,
  type ElectronicPdfSettings,
  type ImageAdjustments,
  type ProjectState,
} from './ProjectContext';
import { ProImage } from './components/ProImage';
import { arrayMove } from '@dnd-kit/sortable';
import { createLogger } from './utils/logger';
import PrintScreen from './PrintScreen';
import { EditorHeader } from './components/EditorHeader';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';
import { getFontFamilyStack, waitForProjectFonts } from './utils/fonts';
import { StoryTextOverlay } from './components/StoryTextOverlay';
import {
  buildStoryPages,
  getDefaultExportFilename,
  getStrokeColor,
  parseStoryScript,
} from './utils/storyPageRenderer';
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

const logger = createLogger('App');

interface SavedImageEvent {
  filepath: string;
  stable_id?: string;
  page?: number;
  insert_after_current?: boolean;
  status: string;
}

interface BatchEvent {
  total?: number;
}

export default function EditorScreen() {
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

  // Sync Progress State
  const [receivingState, setReceivingState] = useState<{ active: boolean, current: number, total: number }>({ active: false, current: 0, total: 0 });

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



  const defaultScript = `[Cover]
从前有个美丽的森林...

[1]
森林里住着一只小狐狸。`;

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

  useEffect(() => {
    const u1 = listen<SavedImageEvent>('image-saved', (event) => {
      logger.info("UI received image-saved", event.payload);
      const { filepath, stable_id } = event.payload;
      const url = `http://127.0.0.1:14320/images/${filepath}`;
      
      if (stable_id) {
          appendSourceUrlMap(stable_id, filepath);
      }
      
      setTrashedImages(currentTrash => {
          if (currentTrash.includes(url)) {
              logger.info("Image is in frontend trash pool, ignoring:", url);
              return currentTrash;
          }
          
          setImages(prev => {
              if (prev.includes(url)) return prev;
              
              if (event.payload.insert_after_current && selectedIdxRef.current !== null) {
                  const targetIdx = selectedIdxRef.current + 1;
                  const newImages = [...prev];
                  newImages.splice(targetIdx, 0, url);
                  
                  // Trigger shift
                  setTimeout(() => {
                      if (shiftProjectDictionariesRef.current) {
                          shiftProjectDictionariesRef.current((oldIdx) => {
                              if (oldIdx >= targetIdx) return oldIdx + 1;
                              return oldIdx;
                          }, prev.length);
                      }
                  }, 0);
                  
                  return newImages;
              }
              
              return [...prev, url];
          });
          
          setSelectedIdx(prevIdx => {
              if (prevIdx === null) return 0;
              if (event.payload.insert_after_current && selectedIdxRef.current !== null) {
                  return selectedIdxRef.current + 1;
              }
              return prevIdx;
          });
          
          return currentTrash;
      });

      setReceivingState(prev => {
          if (!prev.active) return prev;
          const current = prev.current + 1;
          const active = current < prev.total;
          return { ...prev, current, active };
      });
    });

    const u2 = listen<BatchEvent>('batch-started', (event) => {
        logger.info("UI received batch-started", event.payload);
        setReceivingState({ active: true, current: 0, total: event.payload.total || 0 });
    });

    const u3 = listen('batch-cancelled', () => {
        logger.info("UI received batch-cancelled");
        setReceivingState({ active: false, current: 0, total: 0 });
    });

    return () => {
      Promise.all([u1, u2, u3]).then(fns => fns.forEach(fn => fn()));
    };
  }, [appendSourceUrlMap]);

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


  const cancelReceive = async () => {
      try {
          await fetch('http://127.0.0.1:14320/api/cancel-batch', { method: 'POST' });
          setReceivingState({ active: false, current: 0, total: 0 });
      } catch(e) {
          logger.error("Failed to cancel receive:", e);
      }
  };

  const shiftProjectDictionaries = useCallback((mapping: (oldIdx: number) => number | null, numItems: number) => {
    if (!projectState) return;
    const newImageAdjustments: Record<string, ImageAdjustments> = {};
    const newPageTextOverrides: NonNullable<ProjectState['page_text_overrides']> = {};
    for (let i = 0; i < numItems; i++) {
        const oldKey = String(i);
        const newIdx = mapping(i);
        if (newIdx !== null) {
            const newKey = String(newIdx);
            if (projectState.image_adjustments?.[oldKey]) {
                newImageAdjustments[newKey] = projectState.image_adjustments[oldKey];
            }
            if (projectState.page_text_overrides?.[oldKey]) {
                newPageTextOverrides[newKey] = projectState.page_text_overrides[oldKey];
            }
        }
    }
    updateProjectState({
        image_adjustments: newImageAdjustments,
        page_text_overrides: newPageTextOverrides
    });
  }, [projectState, updateProjectState]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setImages((items) => {
        const oldIndex = items.indexOf(String(active.id));
        const newIndex = items.indexOf(String(over.id));
        if (oldIndex < 0 || newIndex < 0) return items;
        
        if (selectedIdx === oldIndex) {
            setSelectedIdx(newIndex);
        } else if (selectedIdx !== null) {
            if (oldIndex < selectedIdx && newIndex >= selectedIdx) {
                setSelectedIdx(selectedIdx - 1);
            } else if (oldIndex > selectedIdx && newIndex <= selectedIdx) {
                setSelectedIdx(selectedIdx + 1);
            }
        }

        shiftProjectDictionaries((i) => {
            if (i === oldIndex) return newIndex;
            if (oldIndex < newIndex && i > oldIndex && i <= newIndex) return i - 1;
            if (oldIndex > newIndex && i >= newIndex && i < oldIndex) return i + 1;
            return i;
        }, items.length);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleMoveToTop = useCallback((idx: number) => {
      setImages((items) => {
        if (idx <= 0) return items;
        const newIndex = 0;
        const next = arrayMove(items, idx, newIndex);
        
        setSelectedIdx(prev => {
            if (prev === idx) return newIndex;
            if (prev !== null) {
                if (idx < prev && newIndex >= prev) return prev - 1;
                if (idx > prev && newIndex <= prev) return prev + 1;
            }
            return prev;
        });

        shiftProjectDictionaries((i) => {
            if (i === idx) return newIndex;
            if (idx < i && i <= newIndex) return i - 1;
            if (newIndex <= i && i < idx) return i + 1;
            return i;
        }, items.length);

        return next;
      });
  }, [shiftProjectDictionaries]);

  const handleMoveToBottom = useCallback((idx: number) => {
      setImages((items) => {
        if (idx < 0 || idx >= items.length - 1) return items;
        const newIndex = items.length - 1;
        const next = arrayMove(items, idx, newIndex);
        
        setSelectedIdx(prev => {
            if (prev === idx) return newIndex;
            if (prev !== null) {
                if (idx < prev && newIndex >= prev) return prev - 1;
                if (idx > prev && newIndex <= prev) return prev + 1;
            }
            return prev;
        });

        shiftProjectDictionaries((i) => {
            if (i === idx) return newIndex;
            if (idx < i && i <= newIndex) return i - 1;
            if (newIndex <= i && i < idx) return i + 1;
            return i;
        }, items.length);

        return next;
      });
  }, [shiftProjectDictionaries]);

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
      alert('项目中没有可导出的页面。');
      return;
    }

    try {
      const filePath = await save({
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
        defaultPath: `${getDefaultExportFilename(exportState, '-电子版')}.pdf`,
      });
      if (!filePath) return;

      setElectronicPdfProgress({ current: 0, total: getElectronicPdfPageCount(exportState) });
      await waitForProjectFonts(exportState);
      const pdfBytes = await generateElectronicPdf(exportState, setElectronicPdfProgress);
      await writeElectronicPdf(filePath, pdfBytes, electronicPdfSettings, secrets);
      alert(`成功导出电子 PDF 至：\n${filePath}`);
    } catch (error) {
      logger.error('Electronic PDF export failed', error);
      const message = error instanceof Error ? error.message : String(error);
      alert(`电子 PDF 导出失败：${message}`);
    } finally {
      setElectronicPdfProgress(null);
    }
  }, [electronicPdfProgress, globalScript, images, projectState]);

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
          alert('空白页不能直接导出，请在右侧先添加内容或直接删除。');
          return;
      }
      try {
          const ext = id.split('.').pop()?.toLowerCase() || 'jpg';
          const defaultPath = `page_${idx}.${ext}`;
          const filePath = await save({
              filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
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
          alert('导出失败: ' + (typeof e === 'string' ? e : (e as Error)?.message || String(e)));
      }
  }, []);

  const handleCopyToClipboard = useCallback(async (id: string) => {
      if (id.startsWith('blank://')) {
          alert('空白页不能复制。');
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
          if (!ctx) throw new Error("No 2d context");
          ctx.drawImage(img, 0, 0);
          
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          // Convert Uint8ClampedArray to Uint8Array for Tauri API compatibility
          const rgba = new Uint8Array(imgData.data.buffer);
          
          try {
              const tauriImg = await TauriImage.new(rgba, canvas.width, canvas.height);
              await writeImage(tauriImg);
          } catch (err) {
              console.error("Tauri clipboard write failed:", err);
              alert('复制到剪切板失败，请检查桌面端权限。');
          }
      } catch(e) {
          console.error("Failed to copy image", e);
          alert('复制失败: ' + (typeof e === 'string' ? e : (e as Error)?.message || String(e)));
      }
  }, []);

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
            hasTitle={/(?:\[(Title|扉页)\])/i.test(projectState?.global_script || '')}
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
                        <div className="absolute inset-0 flex items-center justify-center transition-colors" style={isTransparent ? transparentBgStyle : { backgroundColor: imageLayer.backgroundColor }}>
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
                <p className="text-lg">等待接收画作...</p>
              </div>
            )}
          </main>

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
            systemFonts={systemFonts}
            extractedColors={extractedColors}
            xyBounds={xyBounds}
            authorBounds={authorBounds}
          />
      </div>
      ) : (
        <PrintScreen requestPdfExport={requestPdfExport} />
      )}

      {/* Bottom Status Bar */}
      <footer className="h-10 bg-card border-t border-border flex items-center justify-between px-4 text-xs flex-shrink-0 relative z-20">
          <div className="flex items-center gap-4 text-muted-foreground">
             {imgMeta ? (
                 <>
                    <span className="flex items-center gap-1"><Info size={14}/> {imgMeta.width} × {imgMeta.height}</span>
                    <span>{imgMeta.sizeMB}</span>
                 </>
             ) : (
                 <span>就绪</span>
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
                   title="适应窗口"
                 >
                   适应
                 </button>
               </div>
             )}
          </div>
          
          <div className="flex items-center gap-4">
              {receivingState.active && (
                  <div className="flex items-center gap-3 bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
                      <span className="font-bold flex items-center gap-2">
                          <RefreshCw size={12} className="animate-spin" />
                          正在接收网页图片... {receivingState.current} / {receivingState.total}
                      </span>
                      <button onClick={cancelReceive} className="hover:text-red-500 transition-colors ml-2" title="中断接收">
                          <XOctagon size={14} />
                      </button>
                  </div>
              )}
              <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground/80">
                  <span className="font-bold text-foreground/50">STORYBOOK CO-EDITOR v1.1.4</span>
                  <span>本地桥接已连接</span>
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
                <h2 className="font-bold text-lg">回收站 ({trashedImages.length})</h2>
              </div>
              <button onClick={() => setShowTrashModal(false)} className="p-2 hover:bg-muted rounded-full">
                <XOctagon size={20} className="text-muted-foreground" />
              </button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              {trashedImages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  回收站是空的
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-4">
                  {trashedImages.map((url) => (
                    <div key={url} className="relative group rounded-lg overflow-hidden border border-border">
                      <img src={url} alt="Trashed" className="w-full aspect-square object-cover opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all" />
                      <button 
                        onClick={() => handleRestoreTrash(url)}
                        className="absolute inset-0 m-auto w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                        title="还原图片"
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
