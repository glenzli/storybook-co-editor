import { useEffect, useState, useMemo, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Image as ImageIcon, Info, XOctagon, RefreshCw, Trash2, ArchiveRestore, ZoomIn } from 'lucide-react';
import { getPaletteSync } from 'colorthief';
import { useProject } from './ProjectContext';
import { arrayMove } from '@dnd-kit/sortable';
import { createLogger } from './utils/logger';
import PrintScreen from './PrintScreen';
import { EditorHeader } from './components/EditorHeader';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';

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
  const { activeWorkspaceId, projectState, updateProjectState, saveProject, saveProjectAs, closeProject, currentProjectPath, isDirty, undo, redo, canUndo, canRedo, isSaving, saveProgress } = useProject();
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


  // Tabs
  const [activeTab, setActiveTab] = useState<'edit' | 'print'>('edit');



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
      const { filepath } = event.payload;
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
      const tid = setTimeout(() => {
        updateProjectState({
            visible_images: images.map(url => url.split('/').pop()!),
            trashed_images: trashedImages.map(url => url.split('/').pop()!),
            global_script: globalScript
        });
      }, 500);
      return () => clearTimeout(tid);
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
    const hasTitle = /(?:\[(Title|扉页)\])/i.test(globalScript);
    const blocks = globalScript.split(/(?=\[(?:Cover|封面|Title|扉页|\d+)\])/i);
    
    blocks.forEach(block => {
      const match = block.match(/\[(Cover|封面|Title|扉页|\d+)\]\s*([\s\S]*)/i);
      if (match) {
        const key = match[1].toLowerCase();
        const text = match[2].trim();
        let idx = 0;
        if (key === 'cover' || key === '封面') {
            idx = 0;
        } else if (key === 'title' || key === '扉页') {
            idx = 1;
        } else {
            idx = parseInt(key, 10) + (hasTitle ? 1 : 0);
        }
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



  // Keyboard shortcuts: Cmd+S, Cmd+Z, Cmd+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDirty, isSaving, saveProject, undo, redo]);
  const handleInsertBlankPage = async () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = projectState?.canvas_width || 1024;
      canvas.height = projectState?.canvas_height || 1024;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Add a virtually invisible timestamp to ensure a unique SHA256 hash
        ctx.fillStyle = 'rgba(0,0,0,0.01)';
        ctx.fillText(Date.now().toString(), 0, 0);
        const base64 = canvas.toDataURL('image/png');
        
        await fetch('http://127.0.0.1:14320/api/save-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64_data: base64 })
        });
      }
    } catch (e) {
      console.error("Failed to insert blank page", e);
    }
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
            handleOpenTrash={handleOpenTrash}
            handleDragEnd={handleDragEnd}
            handleInsertBlank={handleInsertBlankPage}
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
                  <img 
                    src={images[selectedIdx]} 
                    className="rounded-sm"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    alt="Selected page" 
                  />
                  {currentText && (() => {
                    const isCover = selectedIdx === 0;
                    const hasTitle = /(?:\[(Title|扉页)\])/i.test(projectState?.global_script || '');
                    const isTitle = hasTitle && selectedIdx === 1;
                    const baseSettings = isCover ? projectState?.cover_text_settings : (isTitle ? projectState?.title_text_settings : projectState?.inner_text_settings);
                    const pageOverride = !isCover && !isTitle && selectedIdx !== null ? projectState?.page_text_overrides?.[String(selectedIdx)] : undefined;
                    const ff = baseSettings?.font_family || 'serif';
                    const fontFamily = ff === 'sans' ? 'ui-sans-serif, system-ui, sans-serif' : ff === 'serif' ? 'ui-serif, Georgia, serif' : `'${ff}', sans-serif`;
                    const fontSize = baseSettings?.font_size || (isCover ? 40 : (isTitle ? 32 : 20));
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
                          lineHeight: 1.5,
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
                            lineHeight: 1.5,
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
            systemFonts={systemFonts}
            extractedColors={extractedColors}
            xyBounds={xyBounds}
            authorBounds={authorBounds}
          />
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
