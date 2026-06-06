import React, { useState, useMemo, useEffect } from 'react';
import { useProject } from './ProjectContext';
import { Settings, Printer, Download, AlertTriangle, FileText } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export interface ImposedSheet {
  id: string;
  isCover?: boolean;
  front: { left: number | null, right: number | null };
  back?: { left: number | null, right: number | null };
}

function calculateImposition(images: string[], settings: any): ImposedSheet[] {
  if (images.length === 0) return [];
  const sheets: ImposedSheet[] = [];

  const total = images.length;
  if (settings.layout_mode === '1-up' && settings.binding_method === 'perfect') {
      for (let i = 0; i < total; i+=2) {
          sheets.push({
              id: `sheet-1up-${i/2 + 1}`,
              isCover: false,
              front: { left: i, right: null },
              back: { left: (i+1 < total) ? i+1 : null, right: null }
          });
      }
      return sheets;
  }

  const hasBack = settings.has_back_cover;
  
  const coverIdx = 0;
  const backCoverIdx = hasBack ? total - 1 : null;
  
  const innerPages: number[] = [];
  for (let i = 1; i < (hasBack ? total - 1 : total); i++) {
    innerPages.push(i);
  }

  sheets.push({
    id: 'sheet-cover',
    isCover: true,
    front: { left: backCoverIdx, right: coverIdx }
  });

  if (innerPages.length === 0) return sheets;

  const method = settings.binding_method;
  
  if (method === 'saddle') {
    while (innerPages.length % 4 !== 0) {
      innerPages.push(-1);
    }
    const numSheets = innerPages.length / 4;
    for (let i = 0; i < numSheets; i++) {
      const p1 = innerPages[innerPages.length - 1 - i * 2];
      const p2 = innerPages[i * 2];
      const p3 = innerPages[i * 2 + 1];
      const p4 = innerPages[innerPages.length - 2 - i * 2];

      sheets.push({
        id: `sheet-saddle-${i+1}`,
        front: { left: p1 === -1 ? null : p1, right: p2 === -1 ? null : p2 },
        back: { left: p3 === -1 ? null : p3, right: p4 === -1 ? null : p4 }
      });
    }
  } else if (method === 'perfect') {
    while (innerPages.length % 4 !== 0) {
      innerPages.push(-1);
    }
    const totalInner = innerPages.length;
    const half = totalInner / 2;
    for (let i = 0; i < totalInner / 4; i++) {
        const idx1 = i * 2;
        const idx2 = half + i * 2;
        const idx3 = idx1 + 1;
        const idx4 = idx2 + 1;
        
        sheets.push({
            id: `sheet-perfect-2up-${i+1}`,
            front: { left: innerPages[idx1] === -1 ? null : innerPages[idx1], right: innerPages[idx2] === -1 ? null : innerPages[idx2] },
            back: { left: innerPages[idx3] === -1 ? null : innerPages[idx3], right: innerPages[idx4] === -1 ? null : innerPages[idx4] }
        });
    }
  } else if (method === 'butterfly') {
    while (innerPages.length % 2 !== 0) {
      innerPages.push(-1);
    }
    for (let i = 0; i < innerPages.length / 2; i++) {
      const p1 = innerPages[i * 2];
      const p2 = innerPages[i * 2 + 1];
      sheets.push({
        id: `sheet-butterfly-${i+1}`,
        front: { left: p1 === -1 ? null : p1, right: p2 === -1 ? null : p2 }
      });
    }
  }

  return sheets;
}

export default function PrintScreen() {
    const { projectState, updateProjectState } = useProject();

    // Default settings if undefined
    const settings = projectState?.print_settings || {
        paper_size: 'A4',
        paper_orientation: 'portrait',
        book_size: 'A5',
        layout_mode: '2-up',
        binding_method: 'perfect',
        has_back_cover: false,
        spine_mm: 5.0,
        binding_margin_mm: 10.0,
        crop_marks: true,
        offset_x: 0.0,
        offset_y: 0.0,
    };

    const updateSettings = (updates: any) => {
        updateProjectState({ print_settings: { ...settings, ...updates } });
    };

    const totalPages = projectState?.visible_images.length || 0;
    
    // Saddle stitch warning
    const showSaddleWarning = settings.binding_method === 'saddle' && totalPages % 4 !== 0;

    const imposedSheets = useMemo(() => {
        if (!projectState?.visible_images) return [];
        return calculateImposition(projectState.visible_images, settings);
    }, [projectState?.visible_images, settings]);

    return (
        <div className="flex flex-1 overflow-hidden relative bg-muted text-foreground">
            {/* Left/Right Sidebar for Settings */}
            <aside className="w-80 min-w-[320px] bg-card border-r border-border flex flex-col z-20 shadow-xl overflow-y-auto">
                <div className="p-4 border-b border-border flex items-center gap-2">
                    <Printer size={20} className="text-primary" />
                    <h2 className="font-bold whitespace-nowrap">印前配置 (Pre-Press)</h2>
                </div>
                
                <div className="p-4 flex flex-col gap-6 flex-1">
                    {/* Binding Method */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">装订方式</label>
                        <select 
                            className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                            value={settings.binding_method}
                            onChange={(e) => updateSettings({ binding_method: e.target.value })}
                        >
                            <option value="saddle">骑马钉 (Saddle Stitch)</option>
                            <option value="perfect">无线胶装 (Perfect Binding)</option>
                            <option value="butterfly">蝴蝶对裱 (Butterfly)</option>
                        </select>
                    </div>

                    {showSaddleWarning && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3 flex gap-2 text-yellow-600 dark:text-yellow-400">
                            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                            <div className="text-xs">
                                <strong>页数提示</strong><br/>
                                骑马钉要求总页数是 4 的倍数。当前有 {totalPages} 页，导出会自动在末尾填充空白页。
                            </div>
                        </div>
                    )}

                    {/* Paper & Book Size */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">尺寸规格</label>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <span className="text-[10px] text-muted-foreground">打印纸张</span>
                                <select 
                                    className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={settings.paper_size}
                                    onChange={(e) => updateSettings({ paper_size: e.target.value })}
                                >
                                    <option value="A4">A4</option>
                                    <option value="A3">A3</option>
                                </select>
                            </div>
                            <div>
                                <span className="text-[10px] text-muted-foreground">纸张方向</span>
                                <select 
                                    className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={settings.paper_orientation}
                                    onChange={(e) => updateSettings({ paper_orientation: e.target.value })}
                                >
                                    <option value="portrait">纵向 (Portrait)</option>
                                    <option value="landscape">横向 (Landscape)</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                            <div>
                                <span className="text-[10px] text-muted-foreground">成品书籍尺寸</span>
                                <select 
                                    className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={settings.book_size}
                                    onChange={(e) => updateSettings({ book_size: e.target.value })}
                                >
                                    <option value="A5">A5</option>
                                    <option value="A4">A4</option>
                                </select>
                            </div>
                            <div className={settings.binding_method !== 'perfect' ? 'opacity-40 pointer-events-none' : ''}>
                                <span className="text-[10px] text-muted-foreground">纸张排版</span>
                                <select 
                                    className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={settings.binding_method !== 'perfect' ? '2-up' : settings.layout_mode}
                                    onChange={(e) => updateSettings({ layout_mode: e.target.value })}
                                    disabled={settings.binding_method !== 'perfect'}
                                >
                                    <option value="1-up">1-up (单页居中)</option>
                                    <option value="2-up">2-up (双页拼版)</option>
                                </select>
                                {settings.binding_method !== 'perfect' && <p className="text-[9px] text-amber-500 mt-0.5">该装订仅支持 2-up</p>}
                            </div>
                        </div>
                    </div>

                    {/* Margins */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">边距与留白</label>
                        
                        <div className={`flex flex-col gap-1 transition-opacity duration-200 ${settings.binding_method !== 'perfect' ? 'opacity-40 pointer-events-none' : ''}`}>
                            <div className="flex justify-between">
                                <span className="text-sm">内侧刷胶区留白</span>
                                <span className="text-xs font-mono">{settings.binding_margin_mm} mm</span>
                            </div>
                            <input type="range" min="0" max="30" step="1" className="w-full accent-primary" 
                                value={settings.binding_margin_mm}
                                onChange={e => updateSettings({ binding_margin_mm: parseFloat(e.target.value) })}
                            />
                        </div>

                        <div className={`flex flex-col gap-1 mt-2 transition-opacity duration-200 ${
                            (settings.binding_method === 'saddle' || settings.layout_mode === '1-up') ? 'opacity-40 pointer-events-none' : ''
                        }`}>
                            <div className="flex justify-between">
                                <span className="text-sm">连体封面书脊厚度</span>
                                <span className="text-xs font-mono">{settings.spine_mm} mm</span>
                            </div>
                            <input type="range" min="0" max="50" step="0.5" className="w-full accent-primary" 
                                value={settings.spine_mm}
                                onChange={e => updateSettings({ spine_mm: parseFloat(e.target.value) })}
                            />
                        </div>

                        <div className="flex flex-col gap-1 mt-2">
                            <div className="flex justify-between">
                                <span className="text-sm">硬件打印留白 (四周)</span>
                                <span className="text-xs font-mono">{settings.hardware_margin_mm || 0} mm</span>
                            </div>
                            <input type="range" min="0" max="20" step="1" className="w-full accent-primary" 
                                value={settings.hardware_margin_mm || 0}
                                onChange={e => updateSettings({ hardware_margin_mm: parseFloat(e.target.value) })}
                            />
                        </div>
                    </div>

                    {/* Offsets */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">整体偏移 (X / Y)</label>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-muted-foreground">X 轴 (mm)</span>
                                <input type="number" step="1" className="w-full bg-background border border-border rounded-md p-1.5 text-sm outline-none"
                                    value={settings.offset_x}
                                    onChange={e => updateSettings({ offset_x: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-muted-foreground">Y 轴 (mm)</span>
                                <input type="number" step="1" className="w-full bg-background border border-border rounded-md p-1.5 text-sm outline-none"
                                    value={settings.offset_y}
                                    onChange={e => updateSettings({ offset_y: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Options */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">选项</label>
                        
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={settings.crop_marks} onChange={e => updateSettings({ crop_marks: e.target.checked })} className="accent-primary w-4 h-4" />
                            <span className="text-sm">生成印刷裁剪线 (Crop Marks)</span>
                        </label>
                        
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={settings.has_back_cover} onChange={e => updateSettings({ has_back_cover: e.target.checked })} className="accent-primary w-4 h-4" />
                            <span className="text-sm">最后一张作为封底</span>
                        </label>
                    </div>
                </div>

                <div className="p-4 border-t border-border">
                    <button className="w-full py-3 bg-primary text-primary-foreground rounded-md font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-md">
                        <Download size={18} />
                        生成高清 PDF
                    </button>
                </div>
            </aside>

            {/* Main Preview Area */}
            <main className="flex-1 p-8 overflow-y-auto bg-muted/50 flex flex-col items-center gap-12 pb-32">
                <div className="text-center space-y-1">
                    <h1 className="text-xl font-bold">物理印前预览 (Physical Pre-Press Preview)</h1>
                    <p className="text-sm text-muted-foreground">此处模拟 {settings.paper_size} 纸张物理打印排版。蓝色虚线为折叠线或裁剪辅助线。</p>
                </div>

                {imposedSheets.map((sheet, index) => {
                    const pxPerMm = settings.paper_size === 'A3' ? 1.5 : 2.0;
                    
                    const pW_mm = settings.paper_size === 'A3' ? 297 : 210;
                    const pH_mm = settings.paper_size === 'A3' ? 420 : 297;
                    const isLandscape = settings.paper_orientation === 'landscape';
                    let w_mm = isLandscape ? pH_mm : pW_mm;
                    let h_mm = isLandscape ? pW_mm : pH_mm;

                    const bW_mm = settings.book_size === 'A4' ? 210 : 148.5;
                    const bH_mm = settings.book_size === 'A4' ? 297 : 210;

                    if (sheet.isCover) {
                        w_mm = bW_mm * 2 + settings.spine_mm;
                        h_mm = bH_mm;
                    }

                    const w = w_mm * pxPerMm;
                    const h = h_mm * pxPerMm;

                    const hwMargin = (settings.hardware_margin_mm || 0) * pxPerMm;
                    const is1up = settings.binding_method === 'perfect' && settings.layout_mode === '1-up' && !sheet.isCover;

                    return (
                    <div key={sheet.id} className="flex flex-col gap-4 items-center w-full">
                        <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                            <FileText size={16} />
                            {sheet.isCover ? '封面排版 (Cover Spread)' : `第 ${index} 张纸 (Sheet ${index})`}
                        </h3>
                        
                        <div className="flex gap-12 flex-wrap justify-center w-full max-w-5xl">
                            {/* Front Side */}
                            <div className="flex flex-col items-center gap-2">
                                <span className="text-xs font-mono text-muted-foreground">正面 (Front Side)</span>
                                <div className="relative shadow-xl ring-1 ring-border/50 rounded-sm flex items-stretch overflow-hidden"
                                     style={{ 
                                         width: `${w}px`, 
                                         height: `${h}px`,
                                         backgroundColor: 'white'
                                     }}>
                                    
                                    <div className="flex-1 relative flex" style={{ padding: `${hwMargin}px` }}>
                                        <div className="absolute inset-0 border border-gray-100 pointer-events-none" />
                                        
                                        {/* UNIFIED PAPER OFFSET WRAPPER */}
                                        <div className="relative w-full h-full flex" style={{ transform: `translate(${settings.offset_x}px, ${settings.offset_y}px)` }}>
                                            
                                            {/* Crop Marks (Book size bounds) */}
                                            {settings.crop_marks && is1up && (
                                                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-blue-400/30 border-dashed pointer-events-none"
                                                     style={{ width: `${bW_mm * pxPerMm}px`, height: `${bH_mm * pxPerMm}px` }} />
                                            )}

                                            {!is1up && <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-blue-300/50 border-r border-dashed border-blue-400 z-10" />}
                                            {sheet.isCover && settings.spine_mm > 0 && (
                                                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 bg-yellow-200/40 border-x border-yellow-400/50 z-10 flex items-center justify-center overflow-hidden" style={{ width: `${settings.spine_mm * pxPerMm}px` }}>
                                                    <span className="text-[8px] text-yellow-700 -rotate-90 whitespace-nowrap">书脊 {settings.spine_mm}mm</span>
                                                </div>
                                            )}
                                            {settings.binding_method === 'perfect' && !sheet.isCover && (
                                                <>
                                                    {is1up ? (
                                                        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 bg-blue-200/20 border-r border-blue-300/50 z-10 flex items-center justify-center overflow-hidden" 
                                                             style={{ width: `${settings.binding_margin_mm * pxPerMm}px`, marginLeft: `-${(bW_mm * pxPerMm)/2 - (settings.binding_margin_mm * pxPerMm)/2}px` }}>
                                                            <span className="text-[8px] text-blue-700 -rotate-90 whitespace-nowrap">刷胶 (仅预览)</span>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-full bg-blue-200/20 border-r border-blue-300/50 z-10 flex items-center justify-center overflow-hidden" style={{ width: `${settings.binding_margin_mm * pxPerMm}px` }}>
                                                                <span className="text-[8px] text-blue-700 -rotate-90 whitespace-nowrap">刷胶 (仅预览)</span>
                                                            </div>
                                                            <div className="absolute top-0 bottom-0 right-1/2 translate-x-full bg-blue-200/20 border-l border-blue-300/50 z-10 flex items-center justify-center overflow-hidden" style={{ width: `${settings.binding_margin_mm * pxPerMm}px` }}>
                                                                <span className="text-[8px] text-blue-700 -rotate-90 whitespace-nowrap">刷胶 (仅预览)</span>
                                                            </div>
                                                        </>
                                                    )}
                                                </>
                                            )}

                                            {/* Left Page (or Center Page if 1-up) */}
                                            <div className="flex-1 relative flex items-center justify-center overflow-hidden"
                                                 style={{ 
                                                     paddingLeft: (settings.binding_method === 'perfect' && is1up && !sheet.isCover) ? `${settings.binding_margin_mm * pxPerMm}px` : '0px',
                                                     paddingRight: (settings.binding_method === 'perfect' && !is1up && !sheet.isCover) ? `${settings.binding_margin_mm * pxPerMm}px` : '0px'
                                                 }}>
                                                {sheet.front.left !== null ? (
                                                    <div className="w-full h-full flex flex-col items-center justify-center relative">
                                                        <img src={`http://127.0.0.1:14320/images/${projectState?.visible_images[sheet.front.left]}`} className="w-full h-full object-contain" />
                                                        <span className="absolute bottom-1 text-[10px] bg-black/50 text-white px-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                                            {sheet.front.left === 0 ? 'Cover' : `P${sheet.front.left}`}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-300 font-mono text-sm">空白页 (Blank)</span>
                                                )}
                                            </div>
                                            
                                            {/* Right Page (Only if not 1-up) */}
                                            {!is1up && (
                                            <div className="flex-1 relative flex items-center justify-center overflow-hidden"
                                                 style={{ 
                                                     paddingLeft: (settings.binding_method === 'perfect' && !is1up && !sheet.isCover) ? `${settings.binding_margin_mm * pxPerMm}px` : '0px'
                                                 }}>
                                                {sheet.front.right !== null ? (
                                                    <div className="w-full h-full flex flex-col items-center justify-center relative">
                                                        <img src={`http://127.0.0.1:14320/images/${projectState?.visible_images[sheet.front.right]}`} className="w-full h-full object-contain" />
                                                        <span className="absolute bottom-1 text-[10px] bg-black/50 text-white px-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                                            {sheet.front.right === 0 ? 'Cover' : `P${sheet.front.right}`}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-300 font-mono text-sm">空白页 (Blank)</span>
                                                )}
                                            </div>
                                            )}

                                            {settings.crop_marks && !is1up && (
                                                <div className="absolute inset-4 border border-blue-400/30 border-dashed pointer-events-none" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Back Side */}
                            {sheet.back && (
                                <div className="flex flex-col items-center gap-2 opacity-90">
                                    <span className="text-xs font-mono text-muted-foreground">反面 (Back Side)</span>
                                    <div className="relative shadow-xl ring-1 ring-border/50 rounded-sm flex items-stretch overflow-hidden"
                                         style={{ 
                                             width: `${w}px`, 
                                             height: `${h}px`,
                                             backgroundColor: 'white'
                                         }}>
                                        <div className="flex-1 relative flex" style={{ padding: `${hwMargin}px` }}>
                                            <div className="absolute inset-0 border border-gray-100 pointer-events-none" />
                                            
                                            {/* UNIFIED PAPER OFFSET WRAPPER (BACK SIDE INVERTS OFFSET_X) */}
                                            <div className="relative w-full h-full flex" style={{ transform: `translate(${-settings.offset_x}px, ${settings.offset_y}px)` }}>
                                                {settings.crop_marks && is1up && (
                                                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-blue-400/30 border-dashed pointer-events-none"
                                                         style={{ width: `${bW_mm * pxPerMm}px`, height: `${bH_mm * pxPerMm}px` }} />
                                                )}

                                                {!is1up && <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-blue-300/50 border-r border-dashed border-blue-400 z-10" />}
                                                
                                                {settings.binding_method === 'perfect' && !sheet.isCover && (
                                                    <>
                                                        {is1up ? (
                                                            <div className="absolute top-0 bottom-0 left-1/2 translate-x-1/2 bg-blue-200/20 border-l border-blue-300/50 z-10 flex items-center justify-center overflow-hidden" 
                                                                 style={{ width: `${settings.binding_margin_mm * pxPerMm}px`, marginLeft: `${(bW_mm * pxPerMm)/2 - (settings.binding_margin_mm * pxPerMm)}px` }}>
                                                                <span className="text-[8px] text-blue-700 -rotate-90 whitespace-nowrap">刷胶 (仅预览)</span>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-full bg-blue-200/20 border-r border-blue-300/50 z-10 flex items-center justify-center overflow-hidden" style={{ width: `${settings.binding_margin_mm * pxPerMm}px` }}>
                                                                    <span className="text-[8px] text-blue-700 -rotate-90 whitespace-nowrap">刷胶 (仅预览)</span>
                                                                </div>
                                                                <div className="absolute top-0 bottom-0 right-1/2 translate-x-full bg-blue-200/20 border-l border-blue-300/50 z-10 flex items-center justify-center overflow-hidden" style={{ width: `${settings.binding_margin_mm * pxPerMm}px` }}>
                                                                    <span className="text-[8px] text-blue-700 -rotate-90 whitespace-nowrap">刷胶 (仅预览)</span>
                                                                </div>
                                                            </>
                                                        )}
                                                    </>
                                                )}

                                                {/* Left Page (Back) */}
                                                <div className="flex-1 relative flex items-center justify-center overflow-hidden"
                                                     style={{ 
                                                         paddingRight: (settings.binding_method === 'perfect' && is1up && !sheet.isCover) ? `${settings.binding_margin_mm * pxPerMm}px` : '0px',
                                                         paddingRight: (settings.binding_method === 'perfect' && !is1up && !sheet.isCover) ? `${settings.binding_margin_mm * pxPerMm}px` : '0px'
                                                     }}>
                                                    {sheet.back.left !== null ? (
                                                        <div className="w-full h-full flex flex-col items-center justify-center relative">
                                                            <img src={`http://127.0.0.1:14320/images/${projectState?.visible_images[sheet.back.left]}`} className="w-full h-full object-contain" />
                                                            <span className="absolute bottom-1 text-[10px] bg-black/50 text-white px-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                                                {sheet.back.left === 0 ? 'Cover' : `P${sheet.back.left}`}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-300 font-mono text-sm">空白页 (Blank)</span>
                                                    )}
                                                </div>
                                                
                                                {/* Right Page (Back) */}
                                                {!is1up && (
                                                <div className="flex-1 relative flex items-center justify-center overflow-hidden"
                                                     style={{ 
                                                         paddingLeft: (settings.binding_method === 'perfect' && !is1up && !sheet.isCover) ? `${settings.binding_margin_mm * pxPerMm}px` : '0px'
                                                     }}>
                                                    {sheet.back.right !== null ? (
                                                        <div className="w-full h-full flex flex-col items-center justify-center relative">
                                                            <img src={`http://127.0.0.1:14320/images/${projectState?.visible_images[sheet.back.right]}`} className="w-full h-full object-contain" />
                                                            <span className="absolute bottom-1 text-[10px] bg-black/50 text-white px-2 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                                                                {sheet.back.right === 0 ? 'Cover' : `P${sheet.back.right}`}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-300 font-mono text-sm">空白页 (Blank)</span>
                                                    )}
                                                </div>
                                                )}

                                                {settings.crop_marks && !is1up && (
                                                    <div className="absolute inset-4 border border-blue-400/30 border-dashed pointer-events-none" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    );
                })}
            </main>
        </div>
    );
}
