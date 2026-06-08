import { useState } from 'react';
import { PenTool, Type, Maximize2, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';

interface RightSidebarProps {
  isRightOpen: boolean;
  setIsRightOpen: (open: boolean) => void;
  projectState: any;
  updateProjectState: (updates: any) => void;
  globalScript: string;
  setGlobalScript: (script: string) => void;
  imgMeta: { width: number, height: number, sizeMB: string } | null;
  canvasW: number;
  canvasH: number;
  selectedIdx: number | null;

  systemFonts: string[];
  extractedColors: string[];
  xyBounds: { minX: number, maxX: number, minY: number, maxY: number };
  authorBounds: { minX: number, maxX: number, minY: number, maxY: number };
}

export function RightSidebar({
  isRightOpen,
  setIsRightOpen,
  projectState,
  updateProjectState,
  globalScript,
  setGlobalScript,
  imgMeta,
  canvasW,
  canvasH,
  selectedIdx,

  systemFonts,
  extractedColors,
  xyBounds,
  authorBounds
}: RightSidebarProps) {
  const [rightTab, setRightTab] = useState<'script' | 'style'>('script');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ canvas: false, author: true, text: true });



  return (
    <>
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
                      {selectedIdx === 0 ? "封面文字" : (/(?:\[(Title|扉页)\])/i.test(projectState?.global_script || '') && selectedIdx === 1) ? "扉页文字" : "正文文字"}
                    </span>
                  </div>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${openSections.text ? 'rotate-180' : ''}`} />
                </button>
                {openSections.text && (
                <div className="flex flex-col gap-3 pt-2">
                      {(() => {
                        const isCover = selectedIdx === 0;
                        const hasTitle = /(?:\[(Title|扉页)\])/i.test(projectState?.global_script || '');
                        const isTitle = hasTitle && selectedIdx === 1;
                        const currentSettings = isCover ? projectState?.cover_text_settings : (isTitle ? projectState?.title_text_settings : projectState?.inner_text_settings);
                        const defaultSettings = { 
                            font_size: isCover ? 40 : (isTitle ? 32 : 20), 
                            text_color: '#ffffff', 
                            font_family: 'serif',
                            has_shadow: true,
                            offset_x: 0,
                            offset_y: 0
                        };
                        const settings = currentSettings || defaultSettings;

                        // For inner pages (not cover, not title), per-page overrides for position/color
                        const pageKey = String(selectedIdx);
                        const pageOverride = !isCover && !isTitle ? projectState?.page_text_overrides?.[pageKey] : undefined;

                        // Effective values: per-page overrides take priority for inner pages
                        const effectiveColor = (isCover || isTitle) ? settings.text_color : (pageOverride?.text_color ?? settings.text_color ?? '#ffffff');
                        const effectiveOffsetX = (isCover || isTitle) ? (settings.offset_x || 0) : (pageOverride?.offset_x ?? settings.offset_x ?? 0);
                        const effectiveOffsetY = (isCover || isTitle) ? (settings.offset_y || 0) : (pageOverride?.offset_y ?? settings.offset_y ?? 0);

                        // Update shared style (font/size/shadow)
                        const updateSharedSettings = (updates: any) => {
                          if (isCover) {
                            updateProjectState({ cover_text_settings: { ...settings, ...updates } });
                          } else if (isTitle) {
                            updateProjectState({ title_text_settings: { ...settings, ...updates } });
                          } else {
                            updateProjectState({ inner_text_settings: { ...settings, ...updates } });
                          }
                        };

                        // Update per-page overrides (color/offset) — for inner pages only
                        const updatePageOverride = (updates: Partial<{ offset_x: number; offset_y: number; text_color: string }>) => {
                          if (isCover) {
                            updateProjectState({ cover_text_settings: { ...settings, ...updates } });
                          } else if (isTitle) {
                            updateProjectState({ title_text_settings: { ...settings, ...updates } });
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
            </div>
            )}
          </aside>
    </>
  );
}
