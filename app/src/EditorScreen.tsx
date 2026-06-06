import { useEffect, useState, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Image as ImageIcon, Send, PenTool, LayoutTemplate, Moon, Sun, Info, XOctagon, RefreshCw, ChevronLeft, ChevronRight, Trash2, ArchiveRestore, Save, FileBox, XCircle, FolderOpen, Type } from 'lucide-react';
import { useProject } from './ProjectContext';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createLogger } from './utils/logger';

const logger = createLogger('App');

interface SavedImageEvent {
  filepath: string;
  page?: number;
  status: string;
}

interface BatchEvent {
  total?: number;
}

export default function EditorScreen() {
  const { activeWorkspaceId, projectState, updateProjectState, saveProject, saveProjectAs, closeProject, currentProjectPath } = useProject();
  const [images, setImages] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  
  // Trash & Project State
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [trashedImages, setTrashedImages] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Theme
  const [isDark, setIsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Sync Progress State
  const [receivingState, setReceivingState] = useState<{ active: boolean, current: number, total: number }>({ active: false, current: 0, total: 0 });

  // Sidebar States
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);

  // Selected Image Metadata
  const [imgMeta, setImgMeta] = useState<{ width: number, height: number, sizeMB: string } | null>(null);

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

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden transition-colors duration-300">
      
      {/* Top Menu Bar */}
      <header className="h-12 bg-card border-b border-border flex items-center justify-between px-4 text-sm flex-shrink-0 relative z-30 shadow-sm">
          <div className="flex items-center gap-4">
              <span className="font-semibold text-primary flex items-center gap-2">
                  <FileBox size={16} />
                  {projectState?.project_name || "Untitled"}
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={currentProjectPath || "Not saved yet"}>
                  {currentProjectPath ? currentProjectPath.split('/').pop() : "(Unsaved)"}
              </span>
          </div>
          <div className="flex items-center gap-2">
              <button onClick={() => saveProject()} className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted text-foreground transition-colors border border-transparent hover:border-border">
                  <Save size={14} /> 保存
              </button>
              <button onClick={saveProjectAs} className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted text-foreground transition-colors border border-transparent hover:border-border">
                  <FolderOpen size={14} /> 另存为
              </button>
              <div className="w-px h-4 bg-border mx-2"></div>
              <button onClick={closeProject} className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-red-500/10 text-red-500 transition-colors border border-transparent hover:border-red-500/20">
                  <XCircle size={14} /> 关闭项目
              </button>
          </div>
      </header>

      {/* Main Area */}
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
          <main className="flex-1 bg-muted relative flex items-center justify-center p-8 overflow-hidden">
            {selectedIdx !== null && images[selectedIdx] ? (
              <div className="relative max-w-full max-h-full shadow-2xl ring-1 ring-border/50 bg-background/50 backdrop-blur-3xl rounded-sm transition-all duration-300">
                <img 
                  src={images[selectedIdx]} 
                  className="max-w-full max-h-[85vh] object-contain rounded-sm"
                  alt="Selected page" 
                />
                {currentText && (
                  <div className="absolute bottom-10 left-0 w-full px-12">
                    <div 
                      className="text-center tracking-wide whitespace-pre-wrap transition-all drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                      style={{
                        fontFamily: (() => {
                          const settings = selectedIdx === 0 ? projectState?.cover_text_settings : projectState?.inner_text_settings;
                          const ff = settings?.font_family || 'serif';
                          if (ff === 'sans') return 'ui-sans-serif, system-ui, sans-serif';
                          if (ff === 'serif') return 'ui-serif, Georgia, serif';
                          return `'${ff}', sans-serif`;
                        })(),
                        fontSize: `${(selectedIdx === 0 ? projectState?.cover_text_settings?.font_size : projectState?.inner_text_settings?.font_size) || (selectedIdx === 0 ? 40 : 20)}px`,
                        color: (selectedIdx === 0 ? projectState?.cover_text_settings?.text_color : projectState?.inner_text_settings?.text_color) || '#ffffff',
                      }}
                    >
                      {currentText}
                    </div>
                  </div>
                )}
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

          {/* Right Sidebar: Global Script */}
          <aside className={`overflow-hidden border-l border-border bg-card flex flex-col z-20 shadow-xl transition-all duration-300 ease-in-out ${isRightOpen ? 'w-80 min-w-[320px]' : 'w-0'}`}>
            <div className="p-4 border-b border-border flex items-center gap-2 w-80">
              <PenTool size={20} className="text-amber-500" />
              <h2 className="font-bold whitespace-nowrap">全局绘本剧本</h2>
            </div>
            <div className="p-4 flex-1 flex flex-col gap-4 w-80 overflow-y-auto">
              <p className="text-xs text-muted-foreground">
                使用 [Cover] 和 [1], [2] 标记将剧本与图片关联。第一张图默认为封面。
              </p>
              <textarea 
                className="flex-1 w-full bg-background border border-border rounded-md p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none transition-all font-mono"
                value={globalScript}
                onChange={(e) => setGlobalScript(e.target.value)}
              />
              
              <div className="bg-muted border border-border rounded-md p-4 text-xs text-muted-foreground space-y-2">
                <p>ℹ️ 智能排版状态：</p>
                <div className="flex justify-between items-center">
                  <span>自动找留白</span>
                  <span className="text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">待执行</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>动态反色字体</span>
                  <span className="text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">待执行</span>
                </div>
              </div>

              {/* Text Styling Panel */}
              <div className="border-t border-border pt-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 mb-1">
                  <Type size={16} className="text-primary" />
                  <h3 className="font-bold text-sm">
                    {selectedIdx === 0 ? "封面文字样式 (Cover)" : "正文文字样式 (Inner)"}
                  </h3>
                </div>
                
                {(() => {
                  const isCover = selectedIdx === 0;
                  const currentSettings = isCover ? projectState?.cover_text_settings : projectState?.inner_text_settings;
                  const defaultSettings = isCover ? { font_size: 40, text_color: '#ffffff', font_family: 'serif' } : { font_size: 20, text_color: '#ffffff', font_family: 'serif' };
                  const settings = currentSettings || defaultSettings;

                  const updateSettings = (updates: any) => {
                    if (isCover) {
                      updateProjectState({ cover_text_settings: { ...settings, ...updates } });
                    } else {
                      updateProjectState({ inner_text_settings: { ...settings, ...updates } });
                    }
                  };

                  return (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-muted-foreground">字体 (Font Family)</label>
                        <select 
                          className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                          value={settings.font_family}
                          onChange={(e) => updateSettings({ font_family: e.target.value })}
                        >
                          <option value="serif">系统衬线体 (Serif)</option>
                          <option value="sans">系统无衬线体 (Sans)</option>
                          <option value="LXGW WenKai">霞鹜文楷 (手写/绘本)</option>
                          <option value="ZCOOL KuaiLe">站酷快乐体 (卡通)</option>
                          <option value="Noto Serif SC">思源宋体 (端庄)</option>
                          <option value="Noto Sans SC">思源黑体 (现代)</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between">
                          <label className="text-xs text-muted-foreground">字号 (Size)</label>
                          <span className="text-xs font-mono">{settings.font_size}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="12" max="100" step="2"
                          className="w-full accent-primary"
                          value={settings.font_size}
                          onChange={(e) => updateSettings({ font_size: parseInt(e.target.value) })}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 mb-2">
                        <label className="text-xs text-muted-foreground">颜色 (Color)</label>
                        <div className="flex gap-2">
                          <button 
                              onClick={() => updateSettings({ text_color: '#ffffff' })}
                              className={`flex-1 py-1 rounded border ${settings.text_color === '#ffffff' ? 'border-primary ring-1 ring-primary' : 'border-border'} bg-black text-white text-xs`}
                          >白</button>
                          <button 
                              onClick={() => updateSettings({ text_color: '#000000' })}
                              className={`flex-1 py-1 rounded border ${settings.text_color === '#000000' ? 'border-primary ring-1 ring-primary' : 'border-border'} bg-white text-black text-xs`}
                          >黑</button>
                          <button 
                              onClick={() => updateSettings({ text_color: '#facc15' })}
                              className={`flex-1 py-1 rounded border ${settings.text_color === '#facc15' ? 'border-primary ring-1 ring-primary' : 'border-border'} bg-yellow-400 text-black text-xs`}
                          >黄</button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              <button className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md font-medium transition-colors flex items-center justify-center gap-2 shadow-md whitespace-nowrap mt-auto">
                <Send size={16} />
                执行智能排版
              </button>
            </div>
          </aside>
      </div>

      {/* Bottom Status Bar */}
      <footer className="h-10 bg-card border-t border-border flex items-center justify-between px-4 text-xs flex-shrink-0 relative z-20">
          <div className="flex items-center gap-4 text-muted-foreground">
             {imgMeta ? (
                 <>
                    <span className="flex items-center gap-1"><Info size={14}/> {imgMeta.width} × {imgMeta.height}</span>
                    <span>{imgMeta.sizeMB}</span>
                 </>
             ) : (
                 <span>Ready</span>
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
                  <span>Local Bridge Active</span>
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
      className={`relative cursor-grab active:cursor-grabbing rounded-lg overflow-hidden border-2 transition-all ${
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
