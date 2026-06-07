import { useEffect, useState, useMemo, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { Image as ImageIcon, Send, PenTool, LayoutTemplate, Moon, Sun, Info, XOctagon, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, Trash2, ArchiveRestore, Save, FileBox, XCircle, FolderOpen, Type, Maximize2, ZoomIn, Undo2, Redo2 } from 'lucide-react';
import { getPaletteSync } from 'colorthief';
import { useProject } from './ProjectContext';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createLogger } from './utils/logger';
import { getSaliencyMap, findBestTextPosition } from './saliency';
import PrintScreen from './PrintScreen';

const logger = createLogger('App');

function getShadowStyle(hexColor: string, hasShadow: boolean) {
    if (!hasShadow) return 'none';
    let hex = hexColor.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' : 'drop-shadow(0 2px 4px rgba(255,255,255,0.8))';
}

interface SavedImageEvent {
  filepath: string;
  page?: number;
  status: string;
}

interface BatchEvent {
  total?: number;
}

export default function EditorScreen() {
  const { activeWorkspaceId, projectState, updateProjectState, saveProject, saveProjectAs, closeProject, currentProjectPath, isDirty, undo, redo, canUndo, canRedo } = useProject();
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
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);
  const [rightTab, setRightTab] = useState<'script' | 'style'>('script');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ canvas: false, author: true, text: true });

  // Tabs
  const [activeTab, setActiveTab] = useState<'edit' | 'print'>('edit');

  // Loading states
  const [isSmartLayoutLoading, setIsSmartLayoutLoading] = useState(false);

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

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const defaultScript = `[Cover]
从前有个美丽的森林...

[1]
森林里住着一只小狐狸。`;

  const [globalScript, setGlobalScript] = useState(defaultScript);

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
    if (projectState) {
        const urls = projectState.visible_images.map((f: string) => `http://127.0.0.1:14320/images/${f}`);
        const trashUrls = projectState.trashed_images.map((f: string) => `http://127.0.0.1:14320/images/${f}`);
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
  }, [activeWorkspaceId]); // Run once when workspace changes

  useEffect(() => {
    const u1 = listen<SavedImageEvent>('image-saved', (event) => {
      logger.info("UI received image-saved", event.payload);
      const { filepath, status } = event.payload;
      const url = `http://127.0.0.1:14320/images/${filepath}`;
      
      setTrashedImages(currentTrash => {
          if (currentTrash.includes(url)) {
              logger.info("Image is in frontend trash pool, ignoring:", url);
              return currentTrash;
          }
          
          setImages(prev => {
              if (prev.includes(url)) return prev;
              return [...prev, url];
          });
          setSelectedIdx(prevIdx => prevIdx === null ? 0 : prevIdx);
          
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
  }, []);

  // Sync project state
  useEffect(() => {
      if (!isLoaded) return;
      updateProjectState({
          visible_images: images.map(url => url.split('/').pop()!),
          trashed_images: trashedImages.map(url => url.split('/').pop()!),
          global_script: globalScript
      });
  }, [images, trashedImages, globalScript, isLoaded]);

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

  // Parse global script into a map
  const parsedScript = useMemo(() => {
    const map = new Map<number, string>();
    const blocks = globalScript.split(/(?=\[(?:Cover|封面|\d+)\])/i);
    
    blocks.forEach(block => {
      const match = block.match(/\[(Cover|封面|\d+)\]\s*([\s\S]*)/i);
      if (match) {
        let key = match[1].toLowerCase();
        let text = match[2].trim();
        let idx = (key === 'cover' || key === '封面') ? 0 : parseInt(key, 10);
        map.set(idx, text);
      }
    });
    return map;
  }, [globalScript]);

  const currentText = selectedIdx !== null ? parsedScript.get(selectedIdx) : "";

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
  }, [selectedIdx, currentText, projectState?.author_name, canvasW, canvasH, projectState?.cover_text_settings?.font_size, projectState?.inner_text_settings?.font_size, projectState?.author_text_settings?.font_size]);

  // Auto-snap: clamp offsets to stay within canvas bounds
  useEffect(() => {
    if (selectedIdx === null) return;
    const isCover = selectedIdx === 0;

    // Get effective offsets (per-page override for inner pages)
    const pageKey = String(selectedIdx);
    const pageOverride = !isCover ? projectState?.page_text_overrides?.[pageKey] : undefined;
    const settings = isCover ? projectState?.cover_text_settings : projectState?.inner_text_settings;
    if (!settings && !pageOverride) return;

    const currentX = pageOverride?.offset_x ?? settings?.offset_x ?? 0;
    const currentY = pageOverride?.offset_y ?? settings?.offset_y ?? 0;

    let newX = currentX;
    let newY = currentY;
    let changed = false;

    if (newX < xyBounds.minX) { newX = xyBounds.minX; changed = true; }
    if (newX > xyBounds.maxX) { newX = xyBounds.maxX; changed = true; }
    if (newY < xyBounds.minY) { newY = xyBounds.minY; changed = true; }
    if (newY > xyBounds.maxY) { newY = xyBounds.maxY; changed = true; }

    let authorChanged = false;
    let authorX = projectState?.author_text_settings?.offset_x || 0;
    let authorY = projectState?.author_text_settings?.offset_y || 0;
    if (isCover) {
      if (authorX < authorBounds.minX) { authorX = authorBounds.minX; authorChanged = true; }
      if (authorX > authorBounds.maxX) { authorX = authorBounds.maxX; authorChanged = true; }
      if (authorY < authorBounds.minY) { authorY = authorBounds.minY; authorChanged = true; }
      if (authorY > authorBounds.maxY) { authorY = authorBounds.maxY; authorChanged = true; }
    }

    if (changed || authorChanged) {
      const updates: any = {};
      if (changed) {
        if (isCover) {
          updates.cover_text_settings = { ...(settings || {}), offset_x: newX, offset_y: newY };
        } else {
          updates.page_text_overrides = {
            ...(projectState?.page_text_overrides || {}),
            [pageKey]: { ...(pageOverride || {}), offset_x: newX, offset_y: newY }
          };
        }
      }
      if (authorChanged) {
        updates.author_text_settings = { ...(projectState?.author_text_settings || {}), offset_x: authorX, offset_y: authorY };
      }
      updateProjectState(updates);
    }
  }, [xyBounds, authorBounds, selectedIdx]);

  const cancelReceive = async () => {
      try {
          await fetch('http://127.0.0.1:14320/api/cancel-batch', { method: 'POST' });
          setReceivingState({ active: false, current: 0, total: 0 });
      } catch(e) {
          logger.error("Failed to cancel receive:", e);
      }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setImages((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        
        if (selectedIdx === oldIndex) {
            setSelectedIdx(newIndex);
        } else if (selectedIdx !== null) {
            if (oldIndex < selectedIdx && newIndex >= selectedIdx) {
                setSelectedIdx(selectedIdx - 1);
            } else if (oldIndex > selectedIdx && newIndex <= selectedIdx) {
                setSelectedIdx(selectedIdx + 1);
            }
        }
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleDelete = (idToRemove: string) => {
      setTrashedImages(prev => {
          if (!prev.includes(idToRemove)) return [...prev, idToRemove];
          return prev;
      });
      
      setImages(prev => {
          const idx = prev.indexOf(idToRemove);
          const next = prev.filter(url => url !== idToRemove);
          if (selectedIdx === idx) {
              setSelectedIdx(next.length > 0 ? 0 : null);
          } else if (selectedIdx !== null && selectedIdx > idx) {
              setSelectedIdx(selectedIdx - 1);
          }
          return next;
      });
  };

  const handleOpenTrash = () => {
      setShowTrashModal(true);
  };

  const handleRestoreTrash = (idToRestore: string) => {
      setImages(prev => [...prev, idToRestore]);
      setTrashedImages(prev => prev.filter(url => url !== idToRestore));
  };

  // Smart text placement using U²-Net saliency detection
  const handleSmartLayout = async () => {
    if (selectedIdx === null || !images[selectedIdx]) return;
    setIsSmartLayoutLoading(true);
    // Yield the main thread to allow React to render the loading spinner
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      const imgUrl = images[selectedIdx];
      const canvasH = projectState?.canvas_height || 1024;

      // Try saliency model first
      const saliency = await getSaliencyMap(imgUrl);
      let result: { offsetY: number; textColor: string; authorOffsetY: number };

      if (saliency) {
        result = findBestTextPosition(
          saliency.map, saliency.width, saliency.height,
          canvasH, xyBounds.minY, xyBounds.maxY, authorBounds.minY, authorBounds.maxY
        );
        // Determine text color from actual image brightness at chosen position
        const bestYNorm = (result.offsetY + canvasH * 0.85) / canvasH;
        const brightAtPos = await getAvgBrightness(imgUrl, bestYNorm);
        result.textColor = brightAtPos > 140 ? '#000000' : '#ffffff';
      } else {
        // Fallback: default bottom position, clamped to bounds
        const fallbackAuthorY = Math.max(authorBounds.minY, Math.min(authorBounds.maxY, Math.round(canvasH * 0.06)));
        result = { offsetY: 0, textColor: '#ffffff', authorOffsetY: fallbackAuthorY };
      }

      const isCover = selectedIdx === 0;
      const updates: any = {};

      if (isCover) {
        const current = projectState?.cover_text_settings || { font_size: 40, text_color: '#ffffff', font_family: 'serif', has_shadow: true, offset_x: 0, offset_y: 0 };
        updates.cover_text_settings = { ...current, offset_y: result.offsetY, text_color: result.textColor };
        if (projectState?.author_name) {
          const authorCurrent = projectState?.author_text_settings || { font_size: 16, text_color: '#ffffff', font_family: 'serif', has_shadow: true, offset_x: 0, offset_y: 0 };
          updates.author_text_settings = { ...authorCurrent, offset_y: result.authorOffsetY, text_color: result.textColor };
        }
      } else {
        const existing = projectState?.page_text_overrides || {};
        const pageKey = String(selectedIdx);
        const currentOverride = existing[pageKey] || { offset_x: 0, offset_y: 0 };
        updates.page_text_overrides = { 
          ...existing, 
          [pageKey]: { ...currentOverride, offset_y: result.offsetY, text_color: result.textColor } 
        };
      }
      updateProjectState(updates);
    } finally {
      setIsSmartLayoutLoading(false);
    }
  };

  const handleSmartLayoutAll = async () => {
    if (!images || images.length === 0) return;
    setIsSmartLayoutLoading(true);
    // Yield the main thread to allow React to render the loading spinner
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      const updates: any = { page_text_overrides: { ...(projectState?.page_text_overrides || {}) } };
      
      for (let i = 0; i < images.length; i++) {
        const imgUrl = images[i];
        const canvasH = projectState?.canvas_height || 1024;
        const saliency = await getSaliencyMap(imgUrl);
        let result: { offsetY: number; textColor: string; authorOffsetY: number };

        if (saliency) {
          result = findBestTextPosition(
            saliency.map, saliency.width, saliency.height,
            canvasH, xyBounds.minY, xyBounds.maxY, authorBounds.minY, authorBounds.maxY
          );
          const bestYNorm = (result.offsetY + canvasH * 0.85) / canvasH;
          const brightAtPos = await getAvgBrightness(imgUrl, bestYNorm);
          result.textColor = brightAtPos > 140 ? '#000000' : '#ffffff';
        } else {
          const fallbackAuthorY = Math.max(authorBounds.minY, Math.min(authorBounds.maxY, Math.round(canvasH * 0.06)));
          result = { offsetY: 0, textColor: '#ffffff', authorOffsetY: fallbackAuthorY };
        }

        if (i === 0) {
          const current = projectState?.cover_text_settings || { font_size: 40, text_color: '#ffffff', font_family: 'serif', has_shadow: true, offset_x: 0, offset_y: 0 };
          updates.cover_text_settings = { ...current, offset_y: result.offsetY, text_color: result.textColor };
          if (projectState?.author_name) {
            const authorCurrent = projectState?.author_text_settings || { font_size: 16, text_color: '#ffffff', font_family: 'serif', has_shadow: true, offset_x: 0, offset_y: 0 };
            updates.author_text_settings = { ...authorCurrent, offset_y: result.authorOffsetY, text_color: result.textColor };
          }
        } else {
          const currentOverride = updates.page_text_overrides[String(i)] || { offset_x: 0, offset_y: 0 };
          updates.page_text_overrides[String(i)] = { ...currentOverride, offset_y: result.offsetY, text_color: result.textColor };
        }
      }
      updateProjectState(updates);
    } finally {
      setIsSmartLayoutLoading(false);
    }
  };

  // Helper: get average brightness at a Y band of an image
  const getAvgBrightness = (imgUrl: string, yNorm: number): Promise<number> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const W = 200, H = Math.round(200 * img.naturalHeight / img.naturalWidth);
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, W, H);
        const { data } = ctx.getImageData(0, 0, W, H);
        const bandH = Math.round(H * 0.1);
        const cy = Math.round(yNorm * H);
        const y0 = Math.max(0, cy - bandH / 2);
        const y1 = Math.min(H, cy + bandH / 2);
        let sum = 0, n = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            sum += data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
            n++;
          }
        }
        resolve(n > 0 ? sum / n : 128);
      };
      img.onerror = () => resolve(128);
      img.src = imgUrl;
    });
  };

  // Keyboard shortcuts: Cmd+S, Cmd+Z, Cmd+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) saveProject();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDirty, saveProject, undo, redo]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden transition-colors duration-300">
      
      {/* Top Menu Bar */}
      <header className="h-12 bg-card border-b border-border flex items-center justify-between px-4 text-sm flex-shrink-0 relative z-30 shadow-sm">
          <div className="flex items-center gap-4 w-1/3">
              <span className="font-semibold text-primary flex items-center gap-2">
                  <FileBox size={16} />
                  {projectState?.project_name || "Untitled"}
                  {isDirty && <span className="w-2 h-2 rounded-full bg-amber-500" title="有未保存的修改" />}
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={currentProjectPath || "未保存"}>
                  {currentProjectPath ? currentProjectPath.split('/').pop() : "(未保存)"}
              </span>
          </div>

          <div className="flex items-center justify-center gap-1 bg-muted p-1 rounded-md border border-border w-1/3 max-w-[200px]">
              <button 
                  onClick={() => setActiveTab('edit')}
                  className={`flex-1 py-1 px-3 rounded text-xs font-medium transition-colors ${activeTab === 'edit' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10'}`}
              >
                  内容编辑
              </button>
              <button 
                  onClick={() => setActiveTab('print')}
                  className={`flex-1 py-1 px-3 rounded text-xs font-medium transition-colors ${activeTab === 'print' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10'}`}
              >
                  印前拼版
              </button>
          </div>

          <div className="flex items-center justify-end gap-1 w-1/3">
              <button onClick={undo} disabled={!canUndo} className={`p-1.5 rounded-md transition-colors ${canUndo ? 'hover:bg-muted text-foreground' : 'text-muted-foreground/30 cursor-not-allowed'}`} title="撤销 (Cmd+Z)">
                  <Undo2 size={14} />
              </button>
              <button onClick={redo} disabled={!canRedo} className={`p-1.5 rounded-md transition-colors ${canRedo ? 'hover:bg-muted text-foreground' : 'text-muted-foreground/30 cursor-not-allowed'}`} title="重做 (Cmd+Shift+Z)">
                  <Redo2 size={14} />
              </button>
              <div className="w-px h-4 bg-border mx-1"></div>
              <button 
                onClick={() => { if (isDirty) saveProject(); }}
                disabled={!isDirty}
                className={`p-1.5 rounded-md transition-colors ${isDirty ? 'hover:bg-muted text-primary' : 'text-muted-foreground/30 cursor-not-allowed'}`}
                title={isDirty ? "保存 (Cmd+S)" : "已保存"}
              >
                  <Save size={14} />
              </button>
              <button onClick={saveProjectAs} className="p-1.5 rounded-md hover:bg-muted text-foreground transition-colors" title="另存为...">
                  <FolderOpen size={14} />
              </button>
              <div className="w-px h-4 bg-border mx-1"></div>
              <button onClick={closeProject} className="p-1.5 rounded-md hover:bg-red-500/10 text-red-500 transition-colors" title="关闭项目">
                  <XCircle size={14} />
              </button>
          </div>
      </header>

      {/* Main Area */}
      {activeTab === 'edit' ? (
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left Sidebar: Pages/Thumbnails */}
          <aside className={`overflow-hidden border-r border-border bg-card flex flex-col z-20 shadow-xl transition-all duration-300 ease-in-out ${isLeftOpen ? 'w-64 min-w-[256px]' : 'w-0'}`}>
            <div className="p-4 border-b border-border flex items-center justify-between w-64">
              <div className="flex items-center gap-2">
                <LayoutTemplate size={20} className="text-primary" />
                <h2 className="font-bold whitespace-nowrap">绘本分页</h2>
              </div>
              <div className="flex gap-1">
                <button onClick={handleOpenTrash} title="回收站" className="p-2 rounded-full hover:bg-red-500/10 text-red-500 transition-colors">
                  <Trash2 size={16} />
                </button>
                <button onClick={() => setIsDark(!isDark)} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors">
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 w-64">
              {images.length === 0 ? (
                <div className="text-muted-foreground text-sm text-center mt-10">
                  暂无页面。<br/>请在浏览器插件中发送图片。
                </div>
              ) : (
                <DndContext 
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={images} strategy={verticalListSortingStrategy}>
                    {images.map((url, idx) => (
                      <SortableImageItem 
                        key={url}
                        id={url}
                        idx={idx}
                        selectedIdx={selectedIdx}
                        setSelectedIdx={setSelectedIdx}
                        onDelete={handleDelete}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </aside>

          {/* Left Sidebar Toggle Button */}
          <button 
            onClick={() => setIsLeftOpen(!isLeftOpen)}
            className={`absolute top-1/2 -translate-y-1/2 z-30 bg-card border border-border rounded-r-md shadow-md p-1 hover:bg-muted transition-all duration-300 ${isLeftOpen ? 'left-64' : 'left-0'}`}
          >
            {isLeftOpen ? <ChevronLeft size={20} className="text-muted-foreground" /> : <ChevronRight size={20} className="text-muted-foreground" />}
          </button>

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
                  <img 
                    src={images[selectedIdx]} 
                    className="rounded-sm"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    alt="Selected page" 
                  />
                  {currentText && (() => {
                    const isCover = selectedIdx === 0;
                    const baseSettings = isCover ? projectState?.cover_text_settings : projectState?.inner_text_settings;
                    const pageOverride = !isCover && selectedIdx !== null ? projectState?.page_text_overrides?.[String(selectedIdx)] : undefined;
                    const ff = baseSettings?.font_family || 'serif';
                    const fontFamily = ff === 'sans' ? 'ui-sans-serif, system-ui, sans-serif' : ff === 'serif' ? 'ui-serif, Georgia, serif' : `'${ff}', sans-serif`;
                    const fontSize = baseSettings?.font_size || (isCover ? 40 : 20);
                    const textColor = (pageOverride?.text_color ?? baseSettings?.text_color) || '#ffffff';
                    const offsetX = pageOverride?.offset_x ?? baseSettings?.offset_x ?? 0;
                    const offsetY = pageOverride?.offset_y ?? baseSettings?.offset_y ?? 0;
                    const hasShadow = baseSettings?.has_shadow ?? true;
                    return (
                    <div className="absolute bottom-10 left-0 w-full px-12 pointer-events-none flex justify-center">
                      <div 
                        ref={textRef}
                        className="text-center tracking-wide whitespace-pre-wrap pointer-events-auto"
                        style={{
                          fontFamily,
                          fontSize: `${fontSize}px`,
                          color: textColor,
                          filter: getShadowStyle(textColor, hasShadow),
                          transform: `translate(${offsetX}px, ${offsetY}px)`
                        }}
                      >
                        {currentText}
                      </div>
                    </div>
                  );
                  })()}
                  {/* Author text overlay — cover only */}
                  {selectedIdx === 0 && projectState?.author_name && (() => {
                    const ats = projectState?.author_text_settings;
                    const ff = ats?.font_family || 'serif';
                    const fontFamily = ff === 'sans' ? 'ui-sans-serif, system-ui, sans-serif' : ff === 'serif' ? 'ui-serif, Georgia, serif' : `'${ff}', sans-serif`;
                    return (
                      <div className="absolute bottom-10 left-0 w-full px-12 pointer-events-none flex justify-center">
                        <div 
                          ref={authorTextRef}
                          className="text-center tracking-wide whitespace-pre-wrap pointer-events-auto"
                          style={{
                            fontFamily,
                            fontSize: `${ats?.font_size || 16}px`,
                            color: ats?.text_color || '#ffffff',
                            filter: getShadowStyle(ats?.text_color || '#ffffff', ats?.has_shadow ?? true),
                            transform: `translate(${ats?.offset_x || 0}px, ${ats?.offset_y || 0}px)`
                          }}
                        >
                          {projectState.author_name}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground flex flex-col items-center gap-4">
                <ImageIcon size={64} className="opacity-30" />
                <p className="text-lg">等待接收画作...</p>
              </div>
            )}
          </main>

          {/* Right Sidebar Toggle Button */}
          <button 
            onClick={() => setIsRightOpen(!isRightOpen)}
            className={`absolute top-1/2 -translate-y-1/2 z-30 bg-card border border-border rounded-l-md shadow-md p-1 hover:bg-muted transition-all duration-300 ${isRightOpen ? 'right-80' : 'right-0'}`}
          >
            {isRightOpen ? <ChevronRight size={20} className="text-muted-foreground" /> : <ChevronLeft size={20} className="text-muted-foreground" />}
          </button>

          {/* Right Sidebar */}
          <aside className={`overflow-hidden border-l border-border bg-card flex flex-col z-20 shadow-xl transition-all duration-300 ease-in-out ${isRightOpen ? 'w-80 min-w-[320px]' : 'w-0'}`}>
            {/* Tab Header */}
            <div className="flex w-80 flex-shrink-0 relative">
              <button
                onClick={() => setRightTab('script')}
                className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                  rightTab === 'script' 
                    ? 'bg-card text-foreground border-transparent' 
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground border-border'
                }`}
              >
                <PenTool size={14} />
                剧本
              </button>
              <button
                onClick={() => setRightTab('style')}
                className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                  rightTab === 'style' 
                    ? 'bg-card text-foreground border-transparent' 
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground border-border'
                }`}
              >
                <Type size={14} />
                样式
              </button>
            </div>

            {/* Script Tab */}
            {rightTab === 'script' && (
            <div className="p-4 flex-1 flex flex-col gap-3 w-80 overflow-hidden">
              <p className="text-xs text-muted-foreground flex-shrink-0">
                使用 [Cover] 和 [1], [2] 标记将剧本与图片关联。第一张图默认为封面。
              </p>
              <textarea 
                className="flex-1 w-full bg-background border border-border rounded-md p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none transition-all font-mono"
                value={globalScript}
                onChange={(e) => setGlobalScript(e.target.value)}
              />
            </div>
            )}

            {/* Style Tab */}
            {rightTab === 'style' && (
            <div className="p-4 flex-1 flex flex-col gap-4 w-80 overflow-y-auto">
              
              {/* Canvas Settings */}
              <div className="border-b border-border pb-2">
                <button onClick={() => setOpenSections(s => ({...s, canvas: !s.canvas}))} className="flex items-center justify-between w-full py-1.5 hover:text-foreground transition-colors">
                  <div className="flex items-center gap-2">
                    <Maximize2 size={14} className="text-emerald-500" />
                    <span className="font-bold text-sm">画布设置</span>
                  </div>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${openSections.canvas ? 'rotate-180' : ''}`} />
                </button>
                {openSections.canvas && (
                <div className="flex flex-col gap-3 pt-2">
                {imgMeta && (canvasW !== imgMeta.width || canvasH !== imgMeta.height) && (
                  <div className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-md px-2 py-1.5">
                    ⚠️ 当前图片 {imgMeta.width}×{imgMeta.height} ≠ 画布 {canvasW}×{canvasH}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-xs text-muted-foreground">宽度</label>
                    <input 
                      type="number" 
                      className="w-full bg-background border border-border rounded-md p-1.5 text-sm text-center font-mono focus:ring-1 focus:ring-primary outline-none"
                      value={canvasW}
                      onChange={(e) => updateProjectState({ canvas_width: parseInt(e.target.value) || 1024 })}
                    />
                  </div>
                  <span className="text-muted-foreground mt-5">×</span>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-xs text-muted-foreground">高度</label>
                    <input 
                      type="number" 
                      className="w-full bg-background border border-border rounded-md p-1.5 text-sm text-center font-mono focus:ring-1 focus:ring-primary outline-none"
                      value={canvasH}
                      onChange={(e) => updateProjectState({ canvas_height: parseInt(e.target.value) || 1024 })}
                    />
                  </div>
                </div>
                <button
                  className="text-xs bg-muted hover:bg-muted/80 border border-border rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    if (imgMeta) {
                      updateProjectState({ canvas_width: imgMeta.width, canvas_height: imgMeta.height });
                    }
                  }}
                  disabled={!imgMeta}
                >
                  🎯 匹配当前图片 {imgMeta ? `(${imgMeta.width}×${imgMeta.height})` : ''}
                </button>
                </div>
                )}
              </div>

              {/* Author Settings — Cover only */}
              {selectedIdx === 0 && (
              <div className="border-b border-border pb-2">
                <button onClick={() => setOpenSections(s => ({...s, author: !s.author}))} className="flex items-center justify-between w-full py-1.5 hover:text-foreground transition-colors">
                  <div className="flex items-center gap-2">
                    <PenTool size={14} className="text-violet-500" />
                    <span className="font-bold text-sm">作者署名</span>
                  </div>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${openSections.author ? 'rotate-180' : ''}`} />
                </button>
                {openSections.author && (
                <div className="flex flex-col gap-3 pt-2">
                <input 
                  type="text"
                  placeholder="输入作者名..."
                  className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                  value={projectState?.author_name || ''}
                  onChange={(e) => updateProjectState({ author_name: e.target.value })}
                />
                {projectState?.author_name && (() => {
                  const ats = projectState?.author_text_settings || { font_size: 16, text_color: '#ffffff', font_family: 'serif', has_shadow: true, offset_x: 0, offset_y: 0 };
                  const updateAts = (updates: any) => updateProjectState({ author_text_settings: { ...ats, ...updates } });
                  return (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-muted-foreground">字体</label>
                        <select 
                          className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                          value={ats.font_family || 'serif'}
                          onChange={(e) => updateAts({ font_family: e.target.value })}
                        >
                          <optgroup label="内置在线字体">
                            <option value="serif">系统衬线体 (Serif)</option>
                            <option value="sans">系统无衬线体 (Sans)</option>
                            <option value="LXGW WenKai">霞鹜文楷 (手写/绘本)</option>
                            <option value="ZCOOL KuaiLe">站酷快乐体 (卡通)</option>
                            <option value="Noto Serif SC">思源宋体 (端庄)</option>
                            <option value="Noto Sans SC">思源黑体 (现代)</option>
                          </optgroup>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between">
                          <label className="text-xs text-muted-foreground">字号</label>
                          <span className="text-xs font-mono">{ats.font_size || 16}px</span>
                        </div>
                        <input 
                          type="range" min="8" max="100" step="1"
                          className="w-full accent-primary"
                          value={ats.font_size || 16}
                          onChange={(e) => updateAts({ font_size: parseInt(e.target.value) })}
                        />
                      </div>

                      <div className="flex items-center justify-between mt-1 border-t border-border pt-2">
                        <div className="flex flex-col gap-1.5 flex-1 pr-4 border-r border-border">
                          <label className="text-xs text-muted-foreground">颜色</label>
                          <div className="flex gap-1.5 items-center flex-wrap">
                            {['#ffffff','#000000', ...extractedColors.slice(0,4)].map((c, i) => (
                              <button key={`a-${c}-${i}`} onClick={() => updateAts({ text_color: c })}
                                className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-125 ${ats.text_color === c ? 'border-primary ring-2 ring-primary/30 scale-110' : 'border-border'}`}
                                style={{ backgroundColor: c }} />
                            ))}
                            <label className="relative cursor-pointer" title="自定义颜色">
                              <input type="color" value={ats.text_color || '#ffffff'} onChange={(e) => updateAts({ text_color: e.target.value })} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                              <span className="w-5 h-5 rounded-full border-2 border-dashed border-muted-foreground flex items-center justify-center text-[10px] text-muted-foreground">+</span>
                            </label>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 pl-4 items-center justify-center">
                          <label className="text-xs text-muted-foreground">智能阴影</label>
                          <input type="checkbox" className="accent-primary w-4 h-4"
                            checked={ats.has_shadow ?? true}
                            onChange={(e) => updateAts({ has_shadow: e.target.checked })}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 mt-2 border-t border-border pt-2">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between">
                            <label className="text-xs text-muted-foreground">水平偏移 (X)</label>
                            <span className="text-xs font-mono">{ats.offset_x || 0}px</span>
                          </div>
                          <input type="range" min={authorBounds.minX} max={authorBounds.maxX} step={1} className="w-full accent-primary" value={ats.offset_x || 0} onChange={(e) => updateAts({ offset_x: parseInt(e.target.value) })} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between">
                            <label className="text-xs text-muted-foreground">垂直偏移 (Y)</label>
                            <span className="text-xs font-mono">{ats.offset_y || 0}px</span>
                          </div>
                          <input type="range" min={authorBounds.minY} max={authorBounds.maxY} step={1} className="w-full accent-primary" value={ats.offset_y || 0} onChange={(e) => updateAts({ offset_y: parseInt(e.target.value) })} />
                        </div>
                      </div>
                    </>
                  );
                })()}
                </div>
                )}
              </div>
              )}

              {/* Text Styling Panel */}
              <div className="border-b border-border pb-2">
                <button onClick={() => setOpenSections(s => ({...s, text: !s.text}))} className="flex items-center justify-between w-full py-1.5 hover:text-foreground transition-colors">
                  <div className="flex items-center gap-2">
                    <Type size={14} className="text-primary" />
                    <span className="font-bold text-sm">
                      {selectedIdx === 0 ? "封面文字" : "正文文字"}
                    </span>
                  </div>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${openSections.text ? 'rotate-180' : ''}`} />
                </button>
                {openSections.text && (
                <div className="flex flex-col gap-3 pt-2">
                {(() => {
                  const isCover = selectedIdx === 0;
                  const currentSettings = isCover ? projectState?.cover_text_settings : projectState?.inner_text_settings;
                  const defaultSettings = { 
                      font_size: isCover ? 40 : 20, 
                      text_color: '#ffffff', 
                      font_family: 'serif',
                      has_shadow: true,
                      offset_x: 0,
                      offset_y: 0
                  };
                  const settings = currentSettings || defaultSettings;

                  // For inner pages, per-page overrides for position/color
                  const pageKey = String(selectedIdx);
                  const pageOverride = !isCover ? projectState?.page_text_overrides?.[pageKey] : undefined;

                  // Effective values: per-page overrides take priority for inner pages
                  const effectiveColor = isCover ? settings.text_color : (pageOverride?.text_color ?? settings.text_color ?? '#ffffff');
                  const effectiveOffsetX = isCover ? (settings.offset_x || 0) : (pageOverride?.offset_x ?? settings.offset_x ?? 0);
                  const effectiveOffsetY = isCover ? (settings.offset_y || 0) : (pageOverride?.offset_y ?? settings.offset_y ?? 0);

                  // Update shared style (font/size/shadow)
                  const updateSharedSettings = (updates: any) => {
                    if (isCover) {
                      updateProjectState({ cover_text_settings: { ...settings, ...updates } });
                    } else {
                      updateProjectState({ inner_text_settings: { ...settings, ...updates } });
                    }
                  };

                  // Update per-page overrides (color/offset) — for inner pages only
                  const updatePageOverride = (updates: Partial<{ offset_x: number; offset_y: number; text_color: string }>) => {
                    if (isCover) {
                      updateProjectState({ cover_text_settings: { ...settings, ...updates } });
                    } else {
                      const existing = projectState?.page_text_overrides || {};
                      const current = existing[pageKey] || { offset_x: settings.offset_x || 0, offset_y: settings.offset_y || 0, text_color: settings.text_color };
                      updateProjectState({ 
                        page_text_overrides: { ...existing, [pageKey]: { ...current, ...updates } } 
                      });
                    }
                  };

                  return (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-muted-foreground">字体</label>
                        <select 
                          className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                          value={settings.font_family}
                          onChange={(e) => updateSharedSettings({ font_family: e.target.value })}
                        >
                          <optgroup label="内置在线字体">
                              <option value="serif">系统衬线体 (Serif)</option>
                              <option value="sans">系统无衬线体 (Sans)</option>
                              <option value="LXGW WenKai">霞鹜文楷 (手写/绘本)</option>
                              <option value="ZCOOL KuaiLe">站酷快乐体 (卡通)</option>
                              <option value="Noto Serif SC">思源宋体 (端庄)</option>
                              <option value="Noto Sans SC">思源黑体 (现代)</option>
                          </optgroup>
                          {systemFonts.length > 0 && (
                              <optgroup label="本地系统字体">
                                  {systemFonts.map(f => <option key={f} value={f}>{f}</option>)}
                              </optgroup>
                          )}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between">
                          <label className="text-xs text-muted-foreground">字号</label>
                          <span className="text-xs font-mono">{settings.font_size}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="12" max="100" step="2"
                          className="w-full accent-primary"
                          value={settings.font_size}
                          onChange={(e) => updateSharedSettings({ font_size: parseInt(e.target.value) })}
                        />
                      </div>

                      <div className="flex items-center justify-between mt-1 border-t border-border pt-2">
                          <div className="flex flex-col gap-1.5 flex-1 pr-4 border-r border-border">
                              <label className="text-xs text-muted-foreground">
                                颜色{!isCover && <span className="text-primary/60 ml-1">(本页)</span>}
                              </label>
                              <div className="flex gap-1.5 items-center flex-wrap">
                                  {['#ffffff','#000000', ...extractedColors].map((c, i) => (
                                    <button 
                                      key={`${c}-${i}`} 
                                      onClick={() => updatePageOverride({ text_color: c })} 
                                      className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-125 ${effectiveColor === c ? 'border-primary ring-2 ring-primary/30 scale-110' : 'border-border'}`}
                                      style={{ backgroundColor: c }}
                                      title={c}
                                    />
                                  ))}
                                  <label className="relative cursor-pointer" title="自定义颜色">
                                    <input 
                                      type="color" 
                                      value={effectiveColor}
                                      onChange={(e) => updatePageOverride({ text_color: e.target.value })}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <span className="w-5 h-5 rounded-full border-2 border-dashed border-muted-foreground flex items-center justify-center text-[10px] text-muted-foreground">+</span>
                                  </label>
                              </div>
                          </div>
                          <div className="flex flex-col gap-1.5 pl-4 items-center justify-center">
                              <label className="text-xs text-muted-foreground">智能阴影</label>
                              <input 
                                type="checkbox" 
                                checked={settings.has_shadow ?? true}
                                onChange={(e) => updateSharedSettings({ has_shadow: e.target.checked })}
                                className="w-4 h-4 accent-primary cursor-pointer"
                              />
                          </div>
                      </div>

                      <div className="flex flex-col gap-3 mt-2 border-t border-border pt-2">
                        {!isCover && (
                          <div className="text-[10px] text-muted-foreground/60 text-center">
                            ↕ 偏移为本页独立设置
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between">
                            <label className="text-xs text-muted-foreground">水平偏移 (X)</label>
                            <span className="text-xs font-mono">{effectiveOffsetX}px</span>
                          </div>
                          <input 
                            type="range" min={xyBounds.minX} max={xyBounds.maxX} step="1" className="w-full accent-primary"
                            value={effectiveOffsetX}
                            onChange={(e) => updatePageOverride({ offset_x: parseInt(e.target.value) })}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between">
                            <label className="text-xs text-muted-foreground">垂直偏移 (Y)</label>
                            <span className="text-xs font-mono">{effectiveOffsetY}px</span>
                          </div>
                          <input 
                            type="range" min={xyBounds.minY} max={xyBounds.maxY} step="1" className="w-full accent-primary"
                            value={effectiveOffsetY}
                            onChange={(e) => updatePageOverride({ offset_y: parseInt(e.target.value) })}
                          />
                        </div>
                      </div>
                    </>
                  );
                })()}
                </div>
                )}
              </div>

              <div className="flex flex-col gap-2 mt-auto">
                <button 
                  onClick={handleSmartLayout}
                  disabled={selectedIdx === null || !images[selectedIdx] || isSmartLayoutLoading}
                  className="w-full py-2.5 bg-secondary hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed text-secondary-foreground border border-border rounded-md font-medium transition-colors flex items-center justify-center gap-2 shadow-sm whitespace-nowrap"
                >
                  {isSmartLayoutLoading ? <RefreshCw size={14} className="animate-spin" /> : <LayoutTemplate size={14} />}
                  排版当前页
                </button>
                <button 
                  onClick={handleSmartLayoutAll}
                  disabled={images.length === 0 || isSmartLayoutLoading}
                  className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground rounded-md font-medium transition-colors flex items-center justify-center gap-2 shadow-sm whitespace-nowrap"
                >
                  {isSmartLayoutLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                  一键全本排版
                </button>
              </div>
            </div>
            )}
          </aside>
      </div>
      ) : (
        <PrintScreen />
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
                  <span className="font-bold text-foreground/50">STORYBOOK CO-EDITOR v1.0</span>
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

    </div>
  );
}

function SortableImageItem({ id, idx, selectedIdx, setSelectedIdx, onDelete }: { id: string, idx: number, selectedIdx: number | null, setSelectedIdx: (idx: number) => void, onDelete: (id: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      onClick={() => setSelectedIdx(idx)}
      className={`relative cursor-grab active:cursor-grabbing rounded-lg overflow-hidden border-2 transition-colors duration-200 ${
        selectedIdx === idx ? 'border-primary shadow-[0_0_15px_hsl(var(--primary)/0.3)]' : 'border-transparent hover:border-border'
      }`}
    >
      <div className="absolute top-1 left-1 bg-black/60 text-xs text-white px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
        {idx === 0 ? 'Cover' : `P${idx}`}
      </div>
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(id); }}
        className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded backdrop-blur-sm hover:bg-red-600 transition-colors z-10"
        title="删除图片"
      >
        <Trash2 size={14} />
      </button>
      <img src={id} alt={`Page ${idx}`} className="w-full h-auto object-cover pointer-events-none" />
    </div>
  );
}
