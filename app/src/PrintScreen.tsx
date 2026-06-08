import React, { useState, useMemo } from 'react';
import { useProject } from './ProjectContext';
import { Printer, Download, AlertTriangle, FileText, RefreshCw } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// html2canvas-compatible: use textShadow instead of filter (html2canvas doesn't support CSS filter: drop-shadow)
function getTextShadowStyle(hexColor: string, hasShadow: boolean): string {
    if (!hasShadow) return 'none';
    let hex = hexColor.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 
        ? '0 0 2px rgba(0,0,0,1), 0 0 6px rgba(0,0,0,0.8), 0 2px 10px rgba(0,0,0,0.4)' 
        : '0 0 2px rgba(255,255,255,1), 0 0 6px rgba(255,255,255,0.9), 0 2px 10px rgba(255,255,255,0.6)';
}

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

    const savedSettings = projectState?.print_settings || {};
    const settings = {
        paper_size: 'A4',
        paper_orientation: 'landscape',
        layout_mode: '2-up',
        binding_method: 'saddle',
        has_back_cover: true,
        spine_mm: 5,
        binding_margin_mm: 15,
        hardware_margin_mm: 5,
        auto_snap_content: true,
        crop_marks: true,
        double_sided: true,
        offset_x: 0.0,
        offset_y: 0.0,
        ...savedSettings
    };

    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

    // Force landscape for saddle/butterfly
    const effectiveOrientation = (settings.binding_method === 'saddle' || settings.binding_method === 'butterfly')
        ? 'landscape'
        : (settings.paper_orientation || 'landscape');

    const generatePDF = async () => {
        if (isExporting) return;
        setIsExporting(true);
        setExportProgress(0);

        try {
            document.body.classList.add('pdf-exporting');
            await new Promise(resolve => setTimeout(resolve, 150));

            const targets = document.querySelectorAll('.sheet-export-target');
            if (targets.length === 0) {
                throw new Error("No sheets to export");
            }

            const pdf = new jsPDF({
                orientation: effectiveOrientation as 'portrait' | 'landscape',
                unit: 'mm',
                format: settings.paper_size.toLowerCase()
            });

            const total = targets.length;
            const canvasArray: HTMLCanvasElement[] = new Array(total);
            const concurrency = 2;
            
            for (let i = 0; i < total; i += concurrency) {
                const chunk = Array.from(targets).slice(i, i + concurrency);
                const promises = chunk.map(async (node, idx) => {
                    const globalIdx = i + idx;
                    const canvas = await html2canvas(node as HTMLElement, { 
                        scale: 5,
                        useCORS: true,
                        allowTaint: true,
                        backgroundColor: '#ffffff'
                    });
                    canvasArray[globalIdx] = canvas;
                });
                
                await Promise.all(promises);
                setExportProgress(Math.round((Math.min(i + concurrency, total) / total) * 80));
            }

            // Now draw text directly onto each canvas using Canvas 2D API.
            // This bypasses html2canvas's text rendering entirely for pixel-perfect positioning.
            const canvasW = projectState?.canvas_width || 1024;
            const canvasH = projectState?.canvas_height || 1024;
            const parsedScriptLocal = new Map<number, string>();
            const script = projectState?.global_script || '';
            const hasTitle = /(?:\[(Title|扉页)\])/i.test(script);
            const blocks = script.split(/(?=\[(?:Cover|封面|Title|扉页|\d+)\])/i);
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
                    parsedScriptLocal.set(idx, text);
                }
            });

            // For each sheet-export-target, find which page containers (data-page-idx) are inside it,
            // then draw their text directly onto the captured canvas.
            const h2cScale = 5; // must match html2canvas scale above
            const baseBottomPx = 40; // Tailwind bottom-10 in canvas coords


            // Map font family keys to canvas-compatible font strings
            const mapFont = (ff: string) => {
                if (ff === 'sans') return '"Helvetica Neue", "PingFang SC", sans-serif';
                if (ff === 'serif') return 'Georgia, "Songti SC", serif';
                return `"${ff}", "PingFang SC", sans-serif`;
            };

            // Helper: get shadow color based on text brightness
            const getShadowColor = (hexColor: string) => {
                let h = hexColor.replace('#', '');
                if (h.length === 3) h = h.split('').map(c => c + c).join('');
                const r = parseInt(h.substring(0, 2), 16) || 0;
                const g = parseInt(h.substring(2, 4), 16) || 0;
                const b = parseInt(h.substring(4, 6), 16) || 0;
                const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
                return yiq >= 128 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)';
            };

            // Draw text on canvas for a specific page
            const drawTextOnCanvas = (
                ctx: CanvasRenderingContext2D,
                pageEl: HTMLElement, // the [data-page-idx] element
                sheetEl: Element,    // the .sheet-export-target element
            ) => {
                const pageIdx = parseInt(pageEl.dataset.pageIdx || '', 10);
                if (isNaN(pageIdx)) return;

                const isCover = pageIdx === 0;
                const hasTitle = /(?:\[(Title|扉页)\])/i.test(projectState?.global_script || '');
                const isTitle = hasTitle && pageIdx === 1;
                const ts = isCover ? projectState?.cover_text_settings : (isTitle ? projectState?.title_text_settings : projectState?.inner_text_settings);
                const pageOverride = !isCover && !isTitle ? projectState?.page_text_overrides?.[String(pageIdx)] : undefined;
                const ff = ts?.font_family || 'serif';

                // Get page element's position relative to the sheet-export-target
                const sheetRect = sheetEl.getBoundingClientRect();
                const pageRect = pageEl.getBoundingClientRect();
                const relLeft = pageRect.left - sheetRect.left;
                const relTop = pageRect.top - sheetRect.top;
                const pageW = pageRect.width;
                const pageH = pageRect.height;

                // Scale factor from canvas coords to page element pixels
                const S = Math.min(pageW / canvasW, pageH / canvasH);

                // All coordinates below are in page-element pixels, relative to page-element origin.
                // Then we add relLeft/relTop to get sheet-relative, then multiply by h2cScale for canvas pixels.

                const drawSingleText = (
                    content: string,
                    fontFamily: string,
                    fontSize: number,
                    color: string,
                    hasShadow: boolean,
                    oxCanvas: number,
                    oyCanvas: number,
                ) => {
                    if (!content) return;

                    // Reset any transforms html2canvas may have left on the context
                    ctx.setTransform(1, 0, 0, 1, 0, 0);

                    const scaledFontSize = fontSize * S * h2cScale;
                    const fontStr = `${scaledFontSize}px ${mapFont(fontFamily)}`;
                    ctx.font = fontStr;
                    ctx.fillStyle = color;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';

                    // Shadow
                    if (hasShadow) {
                        ctx.shadowColor = getShadowColor(color);
                        ctx.shadowBlur = 4 * h2cScale;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 2 * h2cScale;
                    } else {
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                    }

                    // Position: center X with offset, bottom with offset
                    const centerX = (relLeft + pageW / 2 + oxCanvas * S) * h2cScale;
                    const bottomY = (relTop + pageH - (baseBottomPx - oyCanvas) * S) * h2cScale;


                    // Handle multi-line text
                    const lines = content.split('\n');
                    const lineHeight = scaledFontSize * 1.5;
                    for (let li = lines.length - 1; li >= 0; li--) {
                        const y = bottomY - (lines.length - 1 - li) * lineHeight;
                        ctx.fillText(lines[li], centerX, y);
                    }

                    // Reset shadow
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                };

                // Draw title text
                const titleText = parsedScriptLocal.get(pageIdx);
                if (titleText) {
                    const effectiveColor = (pageOverride?.text_color ?? ts?.text_color) || '#ffffff';
                    const effectiveOffsetX = pageOverride?.offset_x ?? ts?.offset_x ?? 0;
                    const effectiveOffsetY = pageOverride?.offset_y ?? ts?.offset_y ?? 0;
                    drawSingleText(
                        titleText, ff,
                        ts?.font_size || (isCover ? 40 : (isTitle ? 32 : 20)),
                        effectiveColor, ts?.has_shadow ?? true,
                        effectiveOffsetX, effectiveOffsetY,
                    );
                }

                // Draw author text (cover only)
                if (isCover && projectState?.author_name) {
                    const ats = projectState?.author_text_settings;
                    drawSingleText(
                        projectState.author_name,
                        ats?.font_family || 'serif',
                        ats?.font_size || 16,
                        ats?.text_color || '#ffffff',
                        ats?.has_shadow ?? true,
                        ats?.offset_x ?? 0,
                        ats?.offset_y ?? 0,
                    );
                }
            };

            // For each captured canvas, find the page containers and draw text
            for (let i = 0; i < total; i++) {
                const canvas = canvasArray[i];
                const ctx = canvas.getContext('2d');
                if (!ctx) continue;

                const target = targets[i];
                const pageEls = target.querySelectorAll('[data-page-idx]');
                pageEls.forEach(el => {
                    drawTextOnCanvas(ctx, el as HTMLElement, target);
                });
            }

            let firstPage = true;
            for (let i = 0; i < total; i++) {
                // Skip blank sheets (no image content)
                const pageEls = targets[i].querySelectorAll('[data-page-idx]');
                if (pageEls.length === 0) continue;

                if (!firstPage) {
                    pdf.addPage();
                }
                firstPage = false;

                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                
                const imgData = canvasArray[i].toDataURL('image/jpeg', 0.95);
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            }

            setExportProgress(95);

            let filename = '';
            if (projectState?.global_script) {
                const lines = projectState.global_script.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.length > 0 && !trimmed.startsWith('[')) {
                        filename = trimmed.substring(0, 30).replace(/[/\\?%*:|"<>]/g, '-');
                        break;
                    }
                }
            }
            if (!filename && projectState?.project_name && projectState.project_name.trim() !== 'Untitled') {
                filename = projectState.project_name.replace(/[/\\?%*:|"<>]/g, '-');
            }
            if (!filename) {
                filename = '未命名';
            }

            // Prompt user for save path
            const filePath = await save({
                filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
                defaultPath: `${filename}.pdf`
            });

            if (filePath) {
                const arrayBuffer = pdf.output('arraybuffer');
                await writeFile(filePath, new Uint8Array(arrayBuffer));
                alert(`成功导出至：\n${filePath}`);
            }
        } catch (err) {
            console.error('PDF export failed:', err);
            alert('PDF 导出失败');
        } finally {
            document.body.classList.remove('pdf-exporting');
            setIsExporting(false);
            setExportProgress(0);
        }
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

    // Track loaded image natural dimensions for content-level crop lines
    type ImgDimMap = { [key: number]: { w: number; h: number } };
    const [imageDims, setImageDims] = useState({} as ImgDimMap);
    const handleImageLoad = (pageIndex: number, e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        setImageDims((prev: ImgDimMap) => {
            if (prev[pageIndex]?.w === img.naturalWidth && prev[pageIndex]?.h === img.naturalHeight) return prev;
            return { ...prev, [pageIndex]: { w: img.naturalWidth, h: img.naturalHeight } };
        });
    };

    // Parse global script for text overlays
    const parsedScript = useMemo(() => {
        const map = new Map<number, string>();
        const script = projectState?.global_script || '';
        const hasTitle = /(?:\[(Title|扉页)\])/i.test(script);
        const blocks = script.split(/(?=\[(?:Cover|封面|Title|扉页|\d+)\])/i);
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
    }, [projectState?.global_script]);

    // Helper: render a complete page cell (image + text) inside a single canvas div.
    // Both image and text share the same canvas coordinate system (canvas_width × canvas_height),
    // then the canvas is CSS-transform-scaled to fit the page slot.
    const canvasW = projectState?.canvas_width || 1024;
    const canvasH = projectState?.canvas_height || 1024;
    
    const renderPageCanvas = (pageIdx: number, slotW: number, slotH: number, objPos: string) => {
        if (pageIdx === null || pageIdx === undefined) return null;
        const imgFile = projectState?.visible_images[pageIdx];
        if (!imgFile) return null;
        
        const text = parsedScript.get(pageIdx);
        const isCover = pageIdx === 0;
        const hasTitle = /(?:\[(Title|扉页)\])/i.test(projectState?.global_script || '');
        const isTitle = hasTitle && pageIdx === 1;
        const ts = isCover ? projectState?.cover_text_settings : (isTitle ? projectState?.title_text_settings : projectState?.inner_text_settings);
        const pageOverride = !isCover && !isTitle ? projectState?.page_text_overrides?.[String(pageIdx)] : undefined;
        const ff = ts?.font_family || 'serif';
        const fontFamily = ff === 'sans' ? 'ui-sans-serif, system-ui, sans-serif' : ff === 'serif' ? 'ui-serif, Georgia, serif' : `'${ff}', sans-serif`;
        const effectiveColor = (pageOverride?.text_color ?? ts?.text_color) || '#ffffff';
        const effectiveOffsetX = pageOverride?.offset_x ?? ts?.offset_x ?? 0;
        const effectiveOffsetY = pageOverride?.offset_y ?? ts?.offset_y ?? 0;
        
        // Scale canvas to fit slot
        const S = Math.min(slotW / canvasW, slotH / canvasH);
        const scaledW = canvasW * S;
        const scaledH = canvasH * S;
        
        // Position the scaled canvas within the slot based on objPos
        let left: number, top: number;
        if (objPos === 'left center') {
            left = 0;
            top = (slotH - scaledH) / 2;
        } else if (objPos === 'right center') {
            left = slotW - scaledW;
            top = (slotH - scaledH) / 2;
        } else {
            left = (slotW - scaledW) / 2;
            top = (slotH - scaledH) / 2;
        }

        const baseBottomPx = 40;
        const basePadPx = 48;
        
        // Text overlay — visible on screen preview, hidden during export.
        // During export, text is drawn via Canvas 2D API for pixel-perfect positioning.
        const renderTextOverlay = (
            content: string,
            font: string,
            fontSize: number,
            color: string,
            hasShadow: boolean,
            oxCanvas: number,
            oyCanvas: number,
        ) => {
            return (
                <div className="hide-on-export" style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    paddingBottom: `${(baseBottomPx - oyCanvas) * S}px`,
                    paddingLeft: `${(basePadPx + oxCanvas) * S}px`,
                    paddingRight: `${(basePadPx - oxCanvas) * S}px`,
                    boxSizing: 'border-box',
                    pointerEvents: 'none' as const,
                }}>
                    <div className="text-center tracking-wide whitespace-pre-wrap" style={{
                        fontFamily: font,
                        fontSize: `${fontSize * S}px`,
                        lineHeight: 1.5,
                        color,
                        textShadow: getTextShadowStyle(color, hasShadow),
                    }}>
                        {content}
                    </div>
                </div>
            );
        };
        
        return (
            <div className="absolute" data-page-idx={pageIdx} style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${scaledW}px`,
                height: `${scaledH}px`,
                overflow: 'hidden',
                position: 'relative',
            }}>
                {/* Image fills canvas with overflow handling */}
                {(() => {
                    const imgAdj = projectState?.image_adjustments?.[String(pageIdx)];
                    const scale = imgAdj?.scale ?? 1;
                    const offsetX = imgAdj?.offset_x ?? 0;
                    const offsetY = imgAdj?.offset_y ?? 0;
                    const bgColor = imgAdj?.bg_color || 'transparent';
                    
                    return (
                        <div className="absolute inset-0 overflow-hidden flex items-center justify-center" style={{ backgroundColor: bgColor }}>
                            <img 
                                crossOrigin="anonymous"
                                onLoad={e => handleImageLoad(pageIdx, e)}
                                src={imgFile.startsWith('blank://') ? "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" : `http://127.0.0.1:14320/images/${imgFile}`}
                                className={`w-full h-full object-contain ${imgFile.startsWith('blank://') ? 'bg-white' : ''}`}
                                style={{ 
                                    transform: `translate(${offsetX}%, ${offsetY}%) scale(${scale})`
                                }}
                            />
                        </div>
                    );
                })()}
                {/* Title text overlay */}
                {text && renderTextOverlay(
                    text,
                    fontFamily,
                    ts?.font_size || (isCover ? 40 : (isTitle ? 32 : 20)),
                    effectiveColor,
                    ts?.has_shadow ?? true,
                    effectiveOffsetX,
                    effectiveOffsetY,
                )}
                {/* Author overlay — cover only */}
                {isCover && projectState?.author_name && (() => {
                    const ats = projectState?.author_text_settings;
                    const aff = ats?.font_family || 'serif';
                    const authorFont = aff === 'sans' ? 'ui-sans-serif, system-ui, sans-serif' : aff === 'serif' ? 'ui-serif, Georgia, serif' : `'${aff}', sans-serif`;
                    return renderTextOverlay(
                        projectState.author_name,
                        authorFont,
                        ats?.font_size || 16,
                        ats?.text_color || '#ffffff',
                        ats?.has_shadow ?? true,
                        ats?.offset_x ?? 0,
                        ats?.offset_y ?? 0,
                    );
                })()}
            </div>
        );
    };


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
                            <option value="saddle">骑马钉</option>
                            <option value="perfect">无线胶装</option>
                            <option value="butterfly">蝴蝶对裱</option>
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

                    {/* Paper & Layout */}
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
                                    <option value="A5">A5</option>
                                    <option value="A4">A4</option>
                                    <option value="A3">A3</option>
                                </select>
                            </div>
                            <div>
                                <span className="text-[10px] text-muted-foreground">纸张方向</span>
                                <select 
                                    className={`w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none ${(settings.binding_method === 'saddle' || settings.binding_method === 'butterfly') ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    value={effectiveOrientation}
                                    onChange={(e) => updateSettings({ paper_orientation: e.target.value })}
                                    disabled={settings.binding_method === 'saddle' || settings.binding_method === 'butterfly'}
                                >
                                    <option value="portrait">纵向</option>
                                    <option value="landscape">横向</option>
                                </select>
                                {(settings.binding_method === 'saddle' || settings.binding_method === 'butterfly') && <p className="text-[9px] text-amber-500 mt-0.5">该装订仅支持横向</p>}
                            </div>
                        </div>
                        <div className={settings.binding_method !== 'perfect' ? 'opacity-40 pointer-events-none' : ''}>
                            <span className="text-[10px] text-muted-foreground">纸张排版</span>
                            <select 
                                className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                value={settings.binding_method !== 'perfect' ? '2-up' : settings.layout_mode}
                                onChange={(e) => updateSettings({ layout_mode: e.target.value })}
                                disabled={settings.binding_method !== 'perfect'}
                            >
                                <option value="1-up">单页</option>
                                <option value="2-up">双页拼版</option>
                            </select>
                            {settings.binding_method !== 'perfect' && <p className="text-[9px] text-amber-500 mt-0.5">该装订仅支持 2-up</p>}
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
                            <input type="range" min="10" max="30" step="1" className="w-full accent-primary" 
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

                    {/* Offset & Snap */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">内容偏移</label>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-muted-foreground">X 轴 (mm){settings.binding_method === 'perfect' ? ' — 相对胶区' : ''}</span>
                                <input type="number" step="1"
                                    min={(settings.auto_snap_content !== false && settings.binding_method === 'perfect') ? 0 : undefined}
                                    className="w-full bg-background border border-border rounded-md p-1.5 text-sm outline-none"
                                    value={settings.offset_x}
                                    onChange={e => {
                                        let val = parseFloat(e.target.value) || 0;
                                        if (settings.auto_snap_content !== false && settings.binding_method === 'perfect') val = Math.max(0, val);
                                        updateSettings({ offset_x: val });
                                    }}
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
                        
                        <label className={`flex items-center gap-2 cursor-pointer ${settings.binding_method !== 'perfect' ? 'opacity-40 pointer-events-none' : ''}`}>
                            <input type="checkbox" checked={settings.auto_snap_content !== false} onChange={e => updateSettings({ auto_snap_content: e.target.checked, offset_x: e.target.checked ? Math.max(0, settings.offset_x || 0) : settings.offset_x })} className="accent-primary w-4 h-4" />
                            <span className="text-sm">内容避开刷胶区 (禁止重叠)</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer mt-1">
                            <input type="checkbox" checked={settings.crop_marks} onChange={e => updateSettings({ crop_marks: e.target.checked })} className="accent-primary w-4 h-4" />
                            <span className="text-sm">生成印刷裁剪线</span>
                        </label>
                        
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={settings.double_sided} onChange={e => updateSettings({ double_sided: e.target.checked })} className="accent-primary w-4 h-4" />
                            <span className="text-sm">双面打印 (背面隐藏裁剪线)</span>
                        </label>
                        
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={settings.has_back_cover} onChange={e => updateSettings({ has_back_cover: e.target.checked })} className="accent-primary w-4 h-4" />
                            <span className="text-sm">最后一张作为封底</span>
                        </label>
                    </div>
                </div>

                <div className="p-4 border-t border-border">
                    <button 
                        onClick={generatePDF}
                        disabled={isExporting}
                        className="w-full py-3 bg-primary text-primary-foreground rounded-md font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shadow-md"
                    >
                        {isExporting ? <RefreshCw size={18} className="animate-spin" /> : <Download size={18} />}
                        {isExporting ? `导出中... ${exportProgress}%` : '生成高清 PDF'}
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
                    const paperSizes: Record<string, [number, number]> = {
                        'A5': [148.5, 210],
                        'A4': [210, 297],
                        'A3': [297, 420],
                    };
                    const [pW_mm, pH_mm] = paperSizes[settings.paper_size] || paperSizes['A4'];
                    const pxPerMm = settings.paper_size === 'A3' ? 1.5 : (settings.paper_size === 'A5' ? 2.5 : 2.0);
                    const isLandscape = effectiveOrientation === 'landscape';
                    let w_mm = isLandscape ? pH_mm : pW_mm;
                    let h_mm = isLandscape ? pW_mm : pH_mm;

                    const hwMarginMm = settings.hardware_margin_mm || 0;
                    const globalIs1up = settings.binding_method === 'perfect' && settings.layout_mode === '1-up';
                    const is1up = globalIs1up && !sheet.isCover;

                    // Auto-derive page dimensions from paper (no separate book_size needed)
                    const bW_mm = globalIs1up ? w_mm : w_mm / 2;
                    const bH_mm = h_mm;

                    if (sheet.isCover) {
                        w_mm = bW_mm * 2 + settings.spine_mm;
                        h_mm = bH_mm;
                    }

                    const w = w_mm * pxPerMm;
                    const h = h_mm * pxPerMm;

                    const hwMargin = hwMarginMm * pxPerMm;
                    
                    const bookBlockWidthPx = is1up 
                        ? bW_mm * pxPerMm 
                        : (bW_mm * 2 + (sheet.isCover ? settings.spine_mm : 0)) * pxPerMm;
                    const bookBlockHeightPx = bH_mm * pxPerMm;

                    const innerW = w - 2 * hwMargin;
                    const innerH = h - 2 * hwMargin;
                    const scaleX = innerW / bookBlockWidthPx;
                    const scaleY = innerH / bookBlockHeightPx;
                    const fitScale = Math.min(1, scaleX, scaleY);

                    // Always left-align front side, right-align back side, vertically centered
                    const scaledW = bookBlockWidthPx * fitScale;
                    const scaledH = bookBlockHeightPx * fitScale;
                    const gapX = Math.max(0, innerW - scaledW);
                    const gapY = Math.max(0, innerH - scaledH);

                    const frontLeft = hwMargin;
                    const frontTop = hwMargin + gapY / 2;
                    const backLeft = hwMargin + gapX;
                    const backTop = hwMargin + gapY / 2;

                    // Content offset relative to glue area edge
                    const autoSnap = settings.auto_snap_content !== false;
                    const effectiveOffsetX = settings.binding_method === 'perfect'
                        ? (autoSnap ? Math.max(0, settings.offset_x || 0) : (settings.offset_x || 0))
                        : 0;
                    return (
                    <div key={sheet.id} className="flex flex-col gap-4 items-center w-full">
                        <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                            <FileText size={16} />
                            {sheet.isCover ? '封面排版 (Cover Spread)' : `第 ${index} 张纸 (Sheet ${index})`}
                        </h3>
                        
                        <div className="flex gap-12 flex-wrap justify-center w-full max-w-5xl">
                            {/* Front Side */}
                            <div className="flex flex-col items-center gap-2">
                                <span className="text-xs font-mono text-muted-foreground hide-on-export">正面 (Front Side)</span>
                                <div className="relative shadow-xl ring-1 ring-border/50 rounded-sm flex items-stretch overflow-hidden sheet-export-target"
                                     style={{ 
                                         width: `${w}px`, 
                                         height: `${h}px`,
                                         backgroundColor: 'white'
                                     }}>
                                    
                                    <div className="flex-1 relative overflow-hidden" style={{ padding: `${hwMargin}px` }}>
                                        <div className="absolute inset-0 border border-gray-100 pointer-events-none" />
                                        
                                        {/* STRICT BOOK BLOCK CONTAINER */}
                                        <div className="absolute flex bg-white ring-1 ring-black/5" 
                                             style={{ 
                                                 width: `${bookBlockWidthPx}px`, 
                                                 height: `${bookBlockHeightPx}px`,
                                                 left: `${frontLeft}px`,
                                                 top: `${frontTop + settings.offset_y}px`,
                                                 transformOrigin: 'top left',
                                                 transform: `scale(${fitScale})`
                                             }}>
                                             
                                            {/* Spine / Center Line (only 2-up) */}
                                            {!is1up && <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-blue-300/50 border-r border-dashed border-blue-400 z-20 hide-on-export" />}
                                            {sheet.isCover && settings.spine_mm > 0 && !is1up && (
                                                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 bg-yellow-200/40 border-x border-yellow-400/50 z-20 flex items-center justify-center overflow-hidden hide-on-export" style={{ width: `${settings.spine_mm * pxPerMm}px` }}>
                                                    <span className="text-[8px] text-yellow-700 -rotate-90 whitespace-nowrap">书脊 {settings.spine_mm}mm</span>
                                                </div>
                                            )}
                                            
                                            {/* Glue Area (Front Side) */}
                                            {settings.binding_method === 'perfect' && !sheet.isCover && (
                                                <>
                                                    {is1up ? (
                                                        <div className="absolute top-0 bottom-0 left-0 bg-blue-200/20 border-r border-blue-300/50 z-20 flex items-center justify-center overflow-hidden hide-on-export" 
                                                             style={{ width: `${settings.binding_margin_mm * pxPerMm}px` }}>
                                                            <span className="text-[8px] text-blue-700 -rotate-90 whitespace-nowrap">刷胶 (仅预览)</span>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-full bg-blue-200/20 border-r border-blue-300/50 z-20 flex items-center justify-center overflow-hidden hide-on-export" style={{ width: `${settings.binding_margin_mm * pxPerMm}px` }}>
                                                                <span className="text-[8px] text-blue-700 -rotate-90 whitespace-nowrap">刷胶 (仅预览)</span>
                                                            </div>
                                                            <div className="absolute top-0 bottom-0 right-1/2 translate-x-full bg-blue-200/20 border-l border-blue-300/50 z-20 flex items-center justify-center overflow-hidden hide-on-export" style={{ width: `${settings.binding_margin_mm * pxPerMm}px` }}>
                                                                <span className="text-[8px] text-blue-700 -rotate-90 whitespace-nowrap">刷胶 (仅预览)</span>
                                                            </div>
                                                        </>
                                                    )}
                                                </>
                                            )}

                                            {/* Left Page (or Center Page if 1-up) */}
                                            <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-white"
                                                 style={{ 
                                                     paddingLeft: (settings.binding_method === 'perfect' && is1up && !sheet.isCover) ? `${(settings.binding_margin_mm + effectiveOffsetX) * pxPerMm}px` : '0px',
                                                     paddingRight: (settings.binding_method === 'perfect' && !is1up && !sheet.isCover) ? `${(settings.binding_margin_mm + effectiveOffsetX) * pxPerMm}px` : '0px'
                                                 }}>
                                                {sheet.front.left !== null ? (
                                                    <div className="w-full h-full relative">
                                                        {(() => {
                                                            const padL = (settings.binding_method === 'perfect' && is1up && !sheet.isCover) ? (settings.binding_margin_mm + effectiveOffsetX) * pxPerMm : 0;
                                                            const padR = (settings.binding_method === 'perfect' && !is1up && !sheet.isCover) ? (settings.binding_margin_mm + effectiveOffsetX) * pxPerMm : 0;
                                                            const cW = bookBlockWidthPx * (is1up ? 1 : 0.5) - padL - padR;
                                                            const objPos = (settings.binding_method === 'perfect' && !sheet.isCover) ? (is1up ? 'left center' : 'right center') : 'center center';
                                                            return renderPageCanvas(sheet.front.left, cW, bookBlockHeightPx, objPos);
                                                        })()}
                                                        <span className="absolute bottom-1 text-[10px] bg-black/50 text-white px-2 rounded-full opacity-0 hover:opacity-100 transition-opacity z-30">
                                                            {sheet.front.left === 0 ? 'Cover' : `P${sheet.front.left}`}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-300 font-mono text-sm hide-on-export">空白页</span>
                                                )}
                                            </div>
                                            
                                            {/* Right Page (Only if not 1-up) */}
                                            {!is1up && (
                                            <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-white"
                                                 style={{ 
                                                     paddingLeft: (settings.binding_method === 'perfect' && !is1up && !sheet.isCover) ? `${(settings.binding_margin_mm + effectiveOffsetX) * pxPerMm}px` : '0px'
                                                 }}>
                                                {sheet.front.right !== null ? (
                                                    <div className="w-full h-full relative">
                                                        {(() => {
                                                            const padL2 = (settings.binding_method === 'perfect' && !is1up && !sheet.isCover) ? (settings.binding_margin_mm + effectiveOffsetX) * pxPerMm : 0;
                                                            const cW2 = bookBlockWidthPx * 0.5 - padL2;
                                                            const objPos2 = (settings.binding_method === 'perfect' && !sheet.isCover) ? 'left center' : 'center center';
                                                            return renderPageCanvas(sheet.front.right, cW2, bookBlockHeightPx, objPos2);
                                                        })()}
                                                        <span className="absolute bottom-1 text-[10px] bg-black/50 text-white px-2 rounded-full opacity-0 hover:opacity-100 transition-opacity z-30">
                                                            {sheet.front.right === 0 ? 'Cover' : `P${sheet.front.right}`}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-300 font-mono text-sm hide-on-export">空白页</span>
                                                )}
                                            </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Crop/Trim Lines (paper level, high z-index) */}
                                    {settings.crop_marks && (() => {
                                        const bbRight = frontLeft + scaledW;
                                        const bbTopY = frontTop + settings.offset_y;
                                        const bbBottom = bbTopY + scaledH;
                                        const lines: React.ReactNode[] = [];
                                        // Book block edge lines
                                        if (bbRight + 2 < w) lines.push(<div key="r" className="absolute top-0 bottom-0 pointer-events-none z-50" style={{ left: `${bbRight}px`, width: 0, borderLeft: '1px dashed rgba(0,0,0,0.4)' }} />);
                                        if (bbTopY > 2) lines.push(<div key="t" className="absolute left-0 right-0 pointer-events-none z-50" style={{ top: `${bbTopY}px`, height: 0, borderTop: '1px dashed rgba(0,0,0,0.4)' }} />);
                                        if (bbBottom + 2 < h) lines.push(<div key="b" className="absolute left-0 right-0 pointer-events-none z-50" style={{ top: `${bbBottom}px`, height: 0, borderTop: '1px dashed rgba(0,0,0,0.4)' }} />);
                                        if (frontLeft > 2) lines.push(<div key="l" className="absolute top-0 bottom-0 pointer-events-none z-50" style={{ left: `${frontLeft}px`, width: 0, borderLeft: '1px dashed rgba(0,0,0,0.4)' }} />);

                                        // Content-level crop lines based on actual image dimensions
                                        const leftPageIdx = sheet.front.left;
                                        if (leftPageIdx !== null && imageDims[leftPageIdx] && !sheet.isCover) {
                                            const dims = imageDims[leftPageIdx];
                                            const imgAspect = dims.w / dims.h;
                                            const padL = (settings.binding_method === 'perfect' && is1up) ? (settings.binding_margin_mm + effectiveOffsetX) * pxPerMm : 0;
                                            const padR = (settings.binding_method === 'perfect' && !is1up) ? (settings.binding_margin_mm + effectiveOffsetX) * pxPerMm : 0;
                                            const cW = bookBlockWidthPx * (is1up ? 1 : 0.5) - padL - padR;
                                            const cH = bookBlockHeightPx;
                                            const containerAspect = cW / cH;
                                            if (containerAspect > imgAspect) {
                                                const imgW = cH * imgAspect;
                                                const cropX = frontLeft + (padL + imgW) * fitScale;
                                                if (cropX + 2 < w) lines.push(<div key="cr" className="absolute top-0 bottom-0 pointer-events-none z-50" style={{ left: `${cropX}px`, width: 0, borderLeft: '1px dashed rgba(0,0,0,0.5)' }} />);
                                            } else if (containerAspect < imgAspect) {
                                                const imgH = cW / imgAspect;
                                                const topOffset = (frontTop + settings.offset_y);
                                                const cropYTop = topOffset + ((cH - imgH) / 2) * fitScale;
                                                const cropYBot = topOffset + ((cH + imgH) / 2) * fitScale;
                                                if (cropYTop > 2) lines.push(<div key="crt" className="absolute left-0 right-0 pointer-events-none z-50" style={{ top: `${cropYTop}px`, height: 0, borderTop: '1px dashed rgba(0,0,0,0.5)' }} />);
                                                if (cropYBot + 2 < h) lines.push(<div key="crb" className="absolute left-0 right-0 pointer-events-none z-50" style={{ top: `${cropYBot}px`, height: 0, borderTop: '1px dashed rgba(0,0,0,0.5)' }} />);
                                            }
                                        }
                                        return <>{lines}</>;
                                    })()}
                                </div>
                            </div>

                            {/* Back Side */}
                            {sheet.back && (
                                <div className="flex flex-col items-center gap-2 opacity-90 back-side-container">
                                    <span className="text-xs font-mono text-muted-foreground hide-on-export">反面 (Back Side)</span>
                                    <div className="relative shadow-xl ring-1 ring-border/50 rounded-sm flex items-stretch overflow-hidden sheet-export-target"
                                         style={{ 
                                             width: `${w}px`, 
                                             height: `${h}px`,
                                             backgroundColor: 'white'
                                         }}>
                                        <div className="flex-1 relative overflow-hidden" style={{ padding: `${hwMargin}px` }}>
                                            <div className="absolute inset-0 border border-gray-100 pointer-events-none" />
                                            
                                            {/* STRICT BOOK BLOCK CONTAINER (BACK SIDE INVERTS OFFSET_X) */}
                                            <div className="absolute flex bg-white ring-1 ring-black/5" 
                                                 style={{ 
                                                     width: `${bookBlockWidthPx}px`, 
                                                     height: `${bookBlockHeightPx}px`,
                                                     left: `${backLeft}px`,
                                                     top: `${backTop + settings.offset_y}px`,
                                                     transformOrigin: 'top left',
                                                     transform: `scale(${fitScale})`
                                                 }}>
                                                 
                                                {/* Spine / Center Line (only 2-up) */}
                                                {!is1up && <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-blue-300/50 border-r border-dashed border-blue-400 z-20 hide-on-export" />}
                                                
                                                {/* Glue Area (Back Side) */}
                                                {settings.binding_method === 'perfect' && !sheet.isCover && (
                                                    <>
                                                        {is1up ? (
                                                            <div className="absolute top-0 bottom-0 right-0 bg-blue-200/20 border-l border-blue-300/50 z-20 flex items-center justify-center overflow-hidden hide-on-export" 
                                                                 style={{ width: `${settings.binding_margin_mm * pxPerMm}px` }}>
                                                                <span className="text-[8px] text-blue-700 -rotate-90 whitespace-nowrap">刷胶 (仅预览)</span>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-full bg-blue-200/20 border-r border-blue-300/50 z-20 flex items-center justify-center overflow-hidden hide-on-export" style={{ width: `${settings.binding_margin_mm * pxPerMm}px` }}>
                                                                    <span className="text-[8px] text-blue-700 -rotate-90 whitespace-nowrap">刷胶 (仅预览)</span>
                                                                </div>
                                                                <div className="absolute top-0 bottom-0 right-1/2 translate-x-full bg-blue-200/20 border-l border-blue-300/50 z-20 flex items-center justify-center overflow-hidden hide-on-export" style={{ width: `${settings.binding_margin_mm * pxPerMm}px` }}>
                                                                    <span className="text-[8px] text-blue-700 -rotate-90 whitespace-nowrap">刷胶 (仅预览)</span>
                                                                </div>
                                                            </>
                                                        )}
                                                    </>
                                                )}

                                                <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-white"
                                                     style={{ 
                                                         paddingRight: (settings.binding_method === 'perfect' && is1up && !sheet.isCover) ? `${(settings.binding_margin_mm + effectiveOffsetX) * pxPerMm}px` : '0px',
                                                         paddingLeft: (settings.binding_method === 'perfect' && !is1up && !sheet.isCover) ? `${(settings.binding_margin_mm + effectiveOffsetX) * pxPerMm}px` : '0px'
                                                     }}>
                                                    {sheet.back.left !== null ? (
                                                        <div className="w-full h-full relative">
                                                            {(() => {
                                                                const padR_b = (settings.binding_method === 'perfect' && is1up && !sheet.isCover) ? (settings.binding_margin_mm + effectiveOffsetX) * pxPerMm : 0;
                                                                const padL_b = (settings.binding_method === 'perfect' && !is1up && !sheet.isCover) ? (settings.binding_margin_mm + effectiveOffsetX) * pxPerMm : 0;
                                                                const cW_b = bookBlockWidthPx * (is1up ? 1 : 0.5) - padL_b - padR_b;
                                                                const objPos_b = (settings.binding_method === 'perfect' && !sheet.isCover) ? (is1up ? 'right center' : 'left center') : 'center center';
                                                                return renderPageCanvas(sheet.back.left, cW_b, bookBlockHeightPx, objPos_b);
                                                            })()}
                                                            <span className="absolute bottom-1 text-[10px] bg-black/50 text-white px-2 rounded-full opacity-0 hover:opacity-100 transition-opacity z-30">
                                                                {sheet.back.left === 0 ? 'Cover' : `P${sheet.back.left}`}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-300 font-mono text-sm hide-on-export">空白页</span>
                                                    )}
                                                </div>
                                                
                                                {/* Right Page (Back) */}
                                                {!is1up && (
                                                <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-white"
                                                     style={{ 
                                                         paddingRight: (settings.binding_method === 'perfect' && !is1up && !sheet.isCover) ? `${(settings.binding_margin_mm + effectiveOffsetX) * pxPerMm}px` : '0px'
                                                     }}>
                                                    {sheet.back.right !== null ? (
                                                        <div className="w-full h-full relative">
                                                            {(() => {
                                                                const padR_br = (settings.binding_method === 'perfect' && !is1up && !sheet.isCover) ? (settings.binding_margin_mm + effectiveOffsetX) * pxPerMm : 0;
                                                                const cW_br = bookBlockWidthPx * 0.5 - padR_br;
                                                                const objPos_br = (settings.binding_method === 'perfect' && !sheet.isCover) ? 'right center' : 'center center';
                                                                return renderPageCanvas(sheet.back.right, cW_br, bookBlockHeightPx, objPos_br);
                                                            })()}
                                                            <span className="absolute bottom-1 text-[10px] bg-black/50 text-white px-2 rounded-full opacity-0 hover:opacity-100 transition-opacity z-30">
                                                                {sheet.back.right === 0 ? 'Cover' : `P${sheet.back.right}`}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-300 font-mono text-sm hide-on-export">空白页</span>
                                                    )}
                                                </div>
                                                )}
                                            </div>
                                        </div>

                                    {/* Crop/Trim Lines (paper level, high z-index) */}
                                    {settings.crop_marks && !settings.double_sided && (() => {
                                        const bbLeft = backLeft;
                                        const bbTopPos = backTop + settings.offset_y;
                                        const bbRight = bbLeft + scaledW;
                                        const bbBottom = bbTopPos + scaledH;
                                        const lines: React.ReactNode[] = [];
                                        if (bbRight + 2 < w) lines.push(<div key="r" className="absolute top-0 bottom-0 pointer-events-none z-50" style={{ left: `${bbRight}px`, width: 0, borderLeft: '1px dashed rgba(0,0,0,0.4)' }} />);
                                        if (bbTopPos > 2) lines.push(<div key="t" className="absolute left-0 right-0 pointer-events-none z-50" style={{ top: `${bbTopPos}px`, height: 0, borderTop: '1px dashed rgba(0,0,0,0.4)' }} />);
                                        if (bbBottom + 2 < h) lines.push(<div key="b" className="absolute left-0 right-0 pointer-events-none z-50" style={{ top: `${bbBottom}px`, height: 0, borderTop: '1px dashed rgba(0,0,0,0.4)' }} />);
                                        if (bbLeft > 2) lines.push(<div key="l" className="absolute top-0 bottom-0 pointer-events-none z-50" style={{ left: `${bbLeft}px`, width: 0, borderLeft: '1px dashed rgba(0,0,0,0.4)' }} />);

                                        // Content-level crop lines (back side)
                                        const backPageIdx = is1up ? sheet.back!.left : sheet.back!.left;
                                        if (backPageIdx !== null && imageDims[backPageIdx] && !sheet.isCover) {
                                            const dims = imageDims[backPageIdx];
                                            const imgAspect = dims.w / dims.h;
                                            const padR = (settings.binding_method === 'perfect' && is1up) ? (settings.binding_margin_mm + effectiveOffsetX) * pxPerMm : 0;
                                            const padL = (settings.binding_method === 'perfect' && !is1up) ? (settings.binding_margin_mm + effectiveOffsetX) * pxPerMm : 0;
                                            const cW = bookBlockWidthPx * (is1up ? 1 : 0.5) - padL - padR;
                                            const cH = bookBlockHeightPx;
                                            const containerAspect = cW / cH;
                                            if (containerAspect > imgAspect) {
                                                const imgW = cH * imgAspect;
                                                // Back side is mirrored: for 1-up, glue is right, content goes left, so crop on left side
                                                const cropX = bbLeft + (is1up ? (cW - imgW) : (padL + imgW)) * fitScale;
                                                if (cropX > 2 && cropX + 2 < w) lines.push(<div key="cr" className="absolute top-0 bottom-0 pointer-events-none z-50" style={{ left: `${cropX}px`, width: 0, borderLeft: '1px dashed rgba(0,0,0,0.5)' }} />);
                                            } else if (containerAspect < imgAspect) {
                                                const imgH = cW / imgAspect;
                                                const cropYTop = bbTopPos + ((cH - imgH) / 2) * fitScale;
                                                const cropYBot = bbTopPos + ((cH + imgH) / 2) * fitScale;
                                                if (cropYTop > 2) lines.push(<div key="crt" className="absolute left-0 right-0 pointer-events-none z-50" style={{ top: `${cropYTop}px`, height: 0, borderTop: '1px dashed rgba(0,0,0,0.5)' }} />);
                                                if (cropYBot + 2 < h) lines.push(<div key="crb" className="absolute left-0 right-0 pointer-events-none z-50" style={{ top: `${cropYBot}px`, height: 0, borderTop: '1px dashed rgba(0,0,0,0.5)' }} />);
                                            }
                                        }
                                        return <>{lines}</>;
                                    })()}
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
