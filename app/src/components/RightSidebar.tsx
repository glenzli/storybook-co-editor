import { effectsFromMode } from '../text-design/effects';
import { useState, useEffect, useRef } from 'react';
import { PenTool, Type, Maximize2, ChevronDown, ChevronRight, ChevronLeft, LayoutTemplate, Pipette, Trash2, Copy, ClipboardPaste, Sparkles } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { useTranslation } from 'react-i18next';
import type {
  ImageAdjustments,
  PageTextOverride,
  ProjectState,
  SelectiveColor,
  TextReadabilityMode,
  TextSettings,
} from '../project/model';
import type { ProjectLanguageSeed } from '../project/languages';
import { isPagePrintOnly, setPagePrintOnly } from '../project/pageSettings';
import {
  BUILT_IN_FONT_OPTIONS,
  getAvailableFontWeights,
  normalizeFontWeight,
} from '../utils/fonts';
import { hasStoryTitle } from '../story/script';
import { ScriptPanel } from './right-sidebar/ScriptPanel';
import { ContentLanguageSwitcher } from './ContentLanguageSwitcher';
import { TextReadabilityControls } from './right-sidebar/TextReadabilityControls';
import {
  normalizeStoryTextWidthPercent,
  normalizeTextReadabilityStrength,
  resolveTextReadabilityMode,
} from '../utils/storyPageRenderer';

const useEyedropper = () => {
  const [isSupported] = useState(() => 'EyeDropper' in window);
  
  const open = async (): Promise<string | null> => {
    if (isSupported) {
      try {
        const EyeDropper = (window as Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
        if (!EyeDropper) return null;
        const dropper = new EyeDropper();
        const result = await dropper.open();
        return result.sRGBHex;
      } catch {
        return null;
      }
    } else {
      return new Promise((resolve) => {
        import('html2canvas').then(({ default: html2canvas }) => {
          html2canvas(document.body, { useCORS: true }).then((canvas) => {
            const overlay = document.createElement('div');
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><g stroke="white" stroke-width="4" fill="none"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l-3-3Z" fill="white"/></g><g stroke="black" stroke-width="2" fill="none"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l-3-3Z" fill="white"/></g></svg>`;
            const cursorUrl = `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') 2 22, crosshair`;
            Object.assign(overlay.style, {
              position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
              cursor: cursorUrl, zIndex: '999999'
            });
            const cleanup = () => { if (document.body.contains(overlay)) document.body.removeChild(overlay); };
            overlay.onclick = (e) => {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                const ratio = window.devicePixelRatio || 1;
                const px = ctx.getImageData(e.clientX * ratio, e.clientY * ratio, 1, 1).data;
                const hex = '#' + [px[0], px[1], px[2]].map(x => x.toString(16).padStart(2, '0')).join('');
                resolve(hex);
              } else resolve(null);
              cleanup();
            };
            overlay.oncontextmenu = (e) => { e.preventDefault(); resolve(null); cleanup(); };
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { resolve(null); cleanup(); } }, { once: true });
            document.body.appendChild(overlay);
          }).catch(() => resolve(null));
        });
      });
    }
  };
  return { open };
};

function hexToHue(hex: string): number {
  if (hex.length !== 7) return 0;
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return Math.round(h * 60); // 0 to 360
}

function hueToHex(hue: number): string {
  const h = hue / 360;
  const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
  };
  const q = 0.5 * (1 + 1); // S=1, L=0.5 -> q=1
  const p = 2 * 0.5 - q;   // p=0
  const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  return '#' + [r,g,b].map(x => x.toString(16).padStart(2, '0')).join('');
}

interface RightSidebarProps {
  isRightOpen: boolean;
  setIsRightOpen: (open: boolean) => void;
  projectState: ProjectState | null;
  updateProjectState: (updates: Partial<ProjectState>) => void;
  globalScript: string;
  setGlobalScript: (script: string) => void;
  contentLanguages: string[];
  activeContentLanguage: string;
  defaultContentLanguage: string;
  setActiveContentLanguage: (language: string) => void;
  addContentLanguage: (language: string, seed?: ProjectLanguageSeed) => void;
  removeContentLanguage: (language: string) => void;
  imgMeta: { width: number, height: number, sizeMB: string } | null;
  canvasW: number;
  canvasH: number;
  selectedIdx: number | null;
  setSelectedIdx: (idx: number | null) => void;
  selectedImage: string | null;
  isAiAvailable: boolean;
  onRedrawImage: () => void;
  onTextDesign: () => void;

  systemFonts: string[];
  extractedColors: string[];
  xyBounds: { minX: number, maxX: number, minY: number, maxY: number };
  authorBounds: { minX: number, maxX: number, minY: number, maxY: number };
}

function SliderControl({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue,
  unit = "",
  onChange,
  className = "",
  valueFormat = (v: number) => String(v)
}: {
  label: string,
  value: number,
  min: number,
  max: number,
  step?: number,
  defaultValue: number,
  unit?: string,
  onChange: (val: number) => void,
  className?: string,
  valueFormat?: (v: number) => string
}) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(valueFormat(value));

  const handleDoubleClick = () => {
    onChange(defaultValue);
  };

  const handleEditSubmit = () => {
    let parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      if (parsed < min) parsed = min;
      if (parsed > max) parsed = max;
      onChange(parsed);
      setEditValue(valueFormat(parsed));
    } else {
      setEditValue(valueFormat(value));
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleEditSubmit();
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(valueFormat(value));
    }
  };

  useEffect(() => {
    if (!isEditing) {
      setEditValue(valueFormat(value));
    }
  }, [value, isEditing, valueFormat]);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex justify-between items-center">
        <label className="text-xs text-muted-foreground">{label}</label>
        {isEditing ? (
          <input
            type="number"
            autoFocus
            className="w-16 text-xs text-right bg-transparent border-b border-primary outline-none text-foreground font-mono"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleEditSubmit}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <span 
            className="text-xs font-mono cursor-pointer hover:text-primary transition-colors" 
            onClick={() => {
              setEditValue(valueFormat(value));
              setIsEditing(true);
            }}
            title={t('rightSidebar.clickToEdit')}
          >
            {valueFormat(value)}{unit}
          </span>
        )}
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step} 
        className="w-full accent-primary cursor-pointer" 
        value={value} 
        onChange={(e) => onChange(parseFloat(e.target.value))} 
        onDoubleClick={handleDoubleClick}
        title={t('rightSidebar.doubleClickReset')}
      />
    </div>
  );
}

function FontControls({
  fontFamily,
  fontWeight,
  systemFonts = [],
  onChange,
}: {
  fontFamily: string;
  fontWeight?: number;
  systemFonts?: string[];
  onChange: (updates: Pick<TextSettings, 'font_family' | 'font_weight'>) => void;
}) {
  const { t } = useTranslation();
  const availableWeights = getAvailableFontWeights(fontFamily);
  const normalizedWeight = normalizeFontWeight(fontFamily, fontWeight);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground">{t('rightSidebar.font')}</label>
        <select
          className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
          value={fontFamily}
          onChange={(event) => {
            const nextFamily = event.target.value;
            onChange({
              font_family: nextFamily,
              font_weight: normalizeFontWeight(nextFamily, fontWeight),
            });
          }}
        >
          <optgroup label={t('rightSidebar.bundledFonts')}>
            {BUILT_IN_FONT_OPTIONS.map((font) => (
              <option key={font.value} value={font.value}>
                {t(`rightSidebar.fonts.${font.translationKey}`)}
              </option>
            ))}
          </optgroup>
          {systemFonts.length > 0 && (
            <optgroup label={t('rightSidebar.systemFonts')}>
              {systemFonts.map(font => <option key={font} value={font}>{font}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      {availableWeights.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">{t('rightSidebar.fontWeight')}</label>
          <select
            className="w-full bg-background border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
            value={normalizedWeight}
            onChange={(event) => onChange({
              font_family: fontFamily,
              font_weight: Number.parseInt(event.target.value, 10),
            })}
          >
            {availableWeights.map(weight => (
              <option key={weight} value={weight}>
                {t(`rightSidebar.fontWeights.${weight}`, { defaultValue: String(weight) })}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function ColorPickerPanel({ 
  colors, 
  value, 
  onChange, 
  allowTransparent = false,
  title,
  className = ""
}: { 
  colors: string[], 
  value: string, 
  onChange: (c: string) => void,
  allowTransparent?: boolean,
  title?: React.ReactNode,
  className?: string
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { open: openEyedropper } = useEyedropper();

  useEffect(() => {
    const listener = (e: MouseEvent | TouchEvent) => {
      if (!popoverRef.current || popoverRef.current.contains(e.target as Node)) return;
      setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [isOpen]);

  const handlePickColor = async () => {
    setIsOpen(false);
    const hex = await openEyedropper();
    if (hex) onChange(hex);
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-xs text-muted-foreground">{title ?? t('rightSidebar.color')}</label>
      <div className="flex gap-1.5 items-center flex-wrap">
        {allowTransparent && (
          <button 
            onClick={() => onChange('transparent')} 
            className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-125 ${value === 'transparent' ? 'border-primary ring-2 ring-primary/30 scale-110' : 'border-border'}`}
            style={{ 
              backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
              backgroundSize: '8px 8px',
              backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px'
            }}
            title={t('rightSidebar.transparent')}
          />
        )}
        {['#ffffff','#000000', ...colors].map((c, i) => (
          <button 
            key={`${c}-${i}`} 
            onClick={() => onChange(c)} 
            className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-125 ${value === c ? 'border-primary ring-2 ring-primary/30 scale-110' : 'border-border'}`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-5 h-5 rounded-full border-2 border-border cursor-pointer transition-transform hover:scale-125 flex items-center justify-center bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)] overflow-hidden"
            title={t('rightSidebar.customColor')}
          >
            <div className="w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: value === 'transparent' ? '#ffffff' : value }} />
          </button>
          
          {isOpen && (
            <div className="absolute top-full left-0 mt-2 z-50 p-3 bg-card border border-border shadow-2xl rounded-xl flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150">
              <HexColorPicker color={value === 'transparent' ? '#ffffff' : value} onChange={onChange} />
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={value === 'transparent' ? '#ffffff' : value} 
                  onChange={e => onChange(e.target.value)}
                  className="flex-1 bg-muted border border-border rounded px-2 py-1 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}
        </div>
        <button onClick={handlePickColor} className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors hover:scale-110" title={t('rightSidebar.pickColor')}>
          <Pipette size={14} />
        </button>
      </div>
    </div>
  );
}

function SyncTextSettingsDialog({
  effectiveColor,
  effectiveOffsetX,
  effectiveOffsetY,
  effectiveReadabilityMode,
  effectiveReadabilityStrength,
  effectiveMaxWidthPercent,
  onSync
}: {
  effectiveColor: string,
  effectiveOffsetX: number,
  effectiveOffsetY: number,
  effectiveReadabilityMode: TextReadabilityMode,
  effectiveReadabilityStrength: number,
  effectiveMaxWidthPercent: number,
  onSync: (opts: { color: boolean, offsetX: boolean, offsetY: boolean, readability: boolean, width: boolean }) => void
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [syncColor, setSyncColor] = useState(true);
  const [syncOffsetX, setSyncOffsetX] = useState(true);
  const [syncOffsetY, setSyncOffsetY] = useState(true);
  const [syncReadability, setSyncReadability] = useState(true);
  const [syncWidth, setSyncWidth] = useState(true);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="mt-4 w-full text-xs py-1.5 border border-border rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center justify-center gap-1"
        title={t('rightSidebar.syncDescription')}
      >
        <span>{t('rightSidebar.syncTitle')}</span>
      </button>
    );
  }

  return (
    <div className="mt-4 p-2.5 border border-primary/30 bg-primary/5 rounded-md flex flex-col gap-2.5 shadow-sm">
      <div className="text-xs font-bold text-foreground">{t('rightSidebar.syncTitle')}</div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
        <input type="checkbox" checked={syncColor} onChange={(e) => setSyncColor(e.target.checked)} className="accent-primary w-3.5 h-3.5" />
        <span className="flex items-center gap-1">
          {t('rightSidebar.syncColor')} <span className="w-3 h-3 rounded-full border border-border inline-block ml-1" style={{ backgroundColor: effectiveColor }}></span>
        </span>
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
        <input type="checkbox" checked={syncOffsetX} onChange={(e) => setSyncOffsetX(e.target.checked)} className="accent-primary w-3.5 h-3.5" />
        {t('rightSidebar.syncOffsetX', { value: effectiveOffsetX })}
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
        <input type="checkbox" checked={syncOffsetY} onChange={(e) => setSyncOffsetY(e.target.checked)} className="accent-primary w-3.5 h-3.5" />
        {t('rightSidebar.syncOffsetY', { value: effectiveOffsetY })}
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
        <input type="checkbox" checked={syncReadability} onChange={(e) => setSyncReadability(e.target.checked)} className="accent-primary w-3.5 h-3.5" />
        {t('rightSidebar.syncReadability', {
          mode: t(`rightSidebar.readabilityModes.${effectiveReadabilityMode}`),
          strength: Math.round(effectiveReadabilityStrength),
        })}
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
        <input type="checkbox" checked={syncWidth} onChange={(e) => setSyncWidth(e.target.checked)} className="accent-primary w-3.5 h-3.5" />
        {t('rightSidebar.syncTextWidth', { value: Math.round(effectiveMaxWidthPercent) })}
      </label>
      <div className="flex gap-2 mt-1">
        <button 
          onClick={() => {
            onSync({
              color: syncColor,
              offsetX: syncOffsetX,
              offsetY: syncOffsetY,
              readability: syncReadability,
              width: syncWidth,
            });
            setIsOpen(false);
          }}
          className="flex-1 bg-primary text-primary-foreground text-xs py-1.5 rounded hover:bg-primary/90 font-medium transition-colors"
        >
          {t('rightSidebar.confirmSync')}
        </button>
        <button 
          onClick={() => setIsOpen(false)}
          className="flex-1 border border-border text-foreground text-xs py-1.5 rounded hover:bg-muted transition-colors"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

let clipboardAdjustments: ImageAdjustments | null = null;

export function RightSidebar({
  isRightOpen,
  setIsRightOpen,
  projectState,
  updateProjectState,
  globalScript,
  setGlobalScript,
  contentLanguages,
  activeContentLanguage,
  defaultContentLanguage,
  setActiveContentLanguage,
  addContentLanguage,
  removeContentLanguage,
  imgMeta,
  canvasW,
  canvasH,
  selectedIdx,
  setSelectedIdx,
  selectedImage,
  isAiAvailable,
  onRedrawImage,
  onTextDesign,
  systemFonts,
  extractedColors,
  xyBounds,
  authorBounds
}: RightSidebarProps) {
  const { t } = useTranslation();
  const [rightTab, setRightTab] = useState<'script' | 'style'>('script');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ canvas: false, author: true, text: true, image: true });

  const [sidebarWidth, setSidebarWidth] = useState(() => parseInt(localStorage.getItem('rightSidebarWidth') || '380', 10));
  const [isDraggingState, setIsDraggingState] = useState(false);
  const isDragging = useRef(false);
  const [hasCopiedAdj, setHasCopiedAdj] = useState(!!clipboardAdjustments);

  useEffect(() => {
    localStorage.setItem('rightSidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      let newWidth = window.innerWidth - e.clientX;
      if (newWidth < 240) newWidth = 240;
      if (newWidth > 800) newWidth = 800;
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setIsDraggingState(false);
        document.body.style.cursor = '';
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    setIsDraggingState(true);
    document.body.style.cursor = 'col-resize';
  };

  const { open: openGlobalEyedropper } = useEyedropper();

  const handleAddSelectiveColor = async (pageKey: string) => {
    const hex = await openGlobalEyedropper();
    if (!hex) return;
    const h = hexToHue(hex);
    
    const existing: Record<string, ImageAdjustments> = projectState?.image_adjustments || {};
    const current: ImageAdjustments = existing[pageKey] || {};
    const selective_colors = [...(current.selective_colors || [])];
    selective_colors.push({
      id: Math.random().toString(36).substr(2, 9),
      target_hue: h,
      d_hue: 0,
      d_sat: 0,
      d_lum: 0
    });
    updateProjectState({
      image_adjustments: { ...existing, [pageKey]: { ...current, selective_colors } }
    });
  };

  const handleUpdateSelectiveColor = (pageKey: string, id: string, updates: Partial<SelectiveColor>) => {
    const existing: Record<string, ImageAdjustments> = projectState?.image_adjustments || {};
    const current: ImageAdjustments = existing[pageKey] || {};
    if (!current.selective_colors) return;
    const selective_colors = current.selective_colors.map((sc) => sc.id === id ? { ...sc, ...updates } : sc);
    updateProjectState({
      image_adjustments: { ...existing, [pageKey]: { ...current, selective_colors } }
    });
  };

  const handleRemoveSelectiveColor = (pageKey: string, id: string) => {
    const existing: Record<string, ImageAdjustments> = projectState?.image_adjustments || {};
    const current: ImageAdjustments = existing[pageKey] || {};
    if (!current.selective_colors) return;
    const selective_colors = current.selective_colors.filter((sc) => sc.id !== id);
    updateProjectState({
      image_adjustments: { ...existing, [pageKey]: { ...current, selective_colors } }
    });
  };

  return (
    <>
          {/* Right Sidebar Toggle Button */}
          <button 
            onClick={() => setIsRightOpen(!isRightOpen)}
            title={t(isRightOpen ? 'rightSidebar.collapse' : 'rightSidebar.expand')}
            style={{ right: isRightOpen ? sidebarWidth : 0 }}
            className={`absolute top-1/2 -translate-y-1/2 z-30 bg-card border border-border rounded-l-md shadow-md p-1 hover:bg-muted ${!isDraggingState ? 'transition-all duration-300' : ''}`}
          >
            {isRightOpen ? <ChevronRight size={20} className="text-muted-foreground" /> : <ChevronLeft size={20} className="text-muted-foreground" />}
          </button>

          {/* Right Sidebar */}
          <aside 
            className={`relative overflow-hidden border-l border-border bg-card flex flex-col z-20 shadow-xl ${!isDraggingState ? 'transition-all duration-300 ease-in-out' : ''}`}
            style={{ width: isRightOpen ? sidebarWidth : 0 }}
          >
            {/* Resizer Handle */}
            <div 
              className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-primary/50 active:bg-primary z-50 transition-colors"
              onMouseDown={handleMouseDown}
            />
            <ContentLanguageSwitcher
              languages={contentLanguages}
              activeLanguage={activeContentLanguage}
              defaultLanguage={defaultContentLanguage}
              projectState={projectState}
              isAiAvailable={isAiAvailable}
              onChange={setActiveContentLanguage}
              onAdd={addContentLanguage}
              onRemove={removeContentLanguage}
            />
            {/* Tab Header */}
            <div className="flex w-full flex-shrink-0 relative">
              <button
                onClick={() => setRightTab('script')}
                className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                  rightTab === 'script' 
                    ? 'bg-card text-foreground border-transparent' 
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground border-border'
                }`}
              >
                <PenTool size={14} />
                {t('rightSidebar.script')}
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
                {t('rightSidebar.style')}
              </button>
            </div>


            {/* Script Tab */}
            {rightTab === 'script' && (
              <ScriptPanel
                value={globalScript}
                onChange={setGlobalScript}
                onCursorChange={setSelectedIdx}
                isAiAvailable={isAiAvailable}
                contentLanguage={activeContentLanguage}
              />
            )}

            {/* Style Tab */}
            {rightTab === 'style' && (
            <div className="p-4 flex-1 flex flex-col gap-4 w-full overflow-y-auto">
              <button
                type="button"
                onClick={onRedrawImage}
                disabled={!isAiAvailable || !selectedImage || selectedImage.startsWith('blank://')}
                title={!isAiAvailable ? t('ai.unavailable') : undefined}
                className="min-h-12 w-full flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles size={16} className="text-primary" />
                {t('ai.redrawImage')}
              </button>

              {projectState && selectedIdx !== null && (
                <label className="flex items-start gap-3 rounded-md border border-border bg-background px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPagePrintOnly(projectState, selectedIdx)}
                    onChange={event => updateProjectState({
                      page_settings: setPagePrintOnly(
                        projectState.page_settings,
                        selectedIdx,
                        event.target.checked,
                      ),
                    })}
                    className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">{t('rightSidebar.printOnly')}</span>
                    <span className="text-xs leading-5 text-muted-foreground">{t('rightSidebar.printOnlyHint')}</span>
                  </span>
                </label>
              )}


              {/* Canvas Settings */}
              <div className="border-b border-border pb-2">
                <button onClick={() => setOpenSections(s => ({...s, canvas: !s.canvas}))} className="flex items-center justify-between w-full py-1.5 hover:text-foreground transition-colors">
                  <div className="flex items-center gap-2">
                    <Maximize2 size={14} className="text-emerald-500" />
                    <span className="font-bold text-sm">{t('rightSidebar.canvas')}</span>
                  </div>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${openSections.canvas ? 'rotate-180' : ''}`} />
                </button>
                {openSections.canvas && (
                <div className="flex flex-col gap-3 pt-2">
                {imgMeta && (canvasW !== imgMeta.width || canvasH !== imgMeta.height) && (
                  <div className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-md px-2 py-1.5">
                    {t('rightSidebar.canvasMismatch', {
                      imageWidth: imgMeta.width,
                      imageHeight: imgMeta.height,
                      canvasWidth: canvasW,
                      canvasHeight: canvasH,
                    })}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-xs text-muted-foreground">{t('rightSidebar.width')}</label>
                    <input 
                      type="number" 
                      className="w-full bg-background border border-border rounded-md p-1.5 text-sm text-center font-mono focus:ring-1 focus:ring-primary outline-none"
                      value={canvasW}
                      onChange={(e) => updateProjectState({ canvas_width: parseInt(e.target.value) || 1024 })}
                    />
                  </div>
                  <span className="text-muted-foreground mt-5">×</span>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-xs text-muted-foreground">{t('rightSidebar.height')}</label>
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
                  {t('rightSidebar.matchImage')} {imgMeta ? `(${imgMeta.width}×${imgMeta.height})` : ''}
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
                    <span className="font-bold text-sm">{t('rightSidebar.author')}</span>
                  </div>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${openSections.author ? 'rotate-180' : ''}`} />
                </button>
                {openSections.author && (
                <div className="flex flex-col gap-3 pt-2">
                <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded border border-border/50">
                  {t('rightSidebar.authorHint')}<br/>
                  {t('rightSidebar.authorExample')}
                </div>
                {(() => {
                  const ats = projectState?.author_text_settings || { font_size: 16, text_color: '#ffffff', font_family: 'serif', has_shadow: true, offset_x: 0, offset_y: 0 };
                  const updateAts = (updates: Partial<TextSettings>) => updateProjectState({ author_text_settings: { ...ats, ...updates } });
                  return (
                    <>
                      <FontControls
                        fontFamily={ats.font_family || 'serif'}
                        fontWeight={ats.font_weight}
                        onChange={updateAts}
                      />

                      <SliderControl
                        label={t('rightSidebar.fontSize')}
                        value={ats.font_size || 16}
                        min={8}
                        max={100}
                        step={1}
                        defaultValue={16}
                        unit="px"
                        onChange={(val) => updateAts({ font_size: val })}
                      />

                      <div className="mt-1 border-t border-border pt-2">
                        <ColorPickerPanel 
                          colors={extractedColors}
                          value={ats.text_color || '#ffffff'}
                          onChange={(c) => updateAts({ text_color: c })}
                        />
                      </div>

                      <TextReadabilityControls
                        effects={ats.text_effects}
                        onEffectsChange={text_effects => updateAts({ text_effects })}
                        mode={resolveTextReadabilityMode(ats)}
                        strength={normalizeTextReadabilityStrength(ats.readability_strength)}
                        maxWidthPercent={normalizeStoryTextWidthPercent(ats.max_width_percent)}
                        pageSpecific={false}
                        onModeChange={mode => updateAts({ readability_mode: mode, text_effects: effectsFromMode(mode, normalizeTextReadabilityStrength(ats.readability_strength)) })}
                        onStrengthChange={readabilityStrength => updateAts({ readability_strength: readabilityStrength })}
                        onMaxWidthChange={maxWidthPercent => updateAts({ max_width_percent: maxWidthPercent })}
                      />

                      <div className="flex flex-col gap-3 mt-2 border-t border-border pt-2">
                        <SliderControl
                          label={t('rightSidebar.horizontalOffset')}
                          value={ats.offset_x || 0}
                          min={authorBounds.minX}
                          max={authorBounds.maxX}
                          defaultValue={0}
                          unit="px"
                          onChange={(val) => updateAts({ offset_x: val })}
                        />
                        <SliderControl
                          label={t('rightSidebar.verticalOffset')}
                          value={ats.offset_y || 0}
                          min={authorBounds.minY}
                          max={authorBounds.maxY}
                          defaultValue={0}
                          unit="px"
                          onChange={(val) => updateAts({ offset_y: val })}
                        />
                      </div>
                    </>
                  );
                })()}
                </div>
                )}
              </div>
              )}

              <button type="button" className="w-full rounded border border-primary/50 p-2 text-sm text-primary" disabled={selectedIdx === null} onClick={onTextDesign}>{t('textDesign.open')}</button>
              {/* Text Styling Panel */}
              <div className="border-b border-border pb-2">
                <button onClick={() => setOpenSections(s => ({...s, text: !s.text}))} className="flex items-center justify-between w-full py-1.5 hover:text-foreground transition-colors">
                  <div className="flex items-center gap-2">
                    <Type size={14} className="text-primary" />
                    <span className="font-bold text-sm">
                      {selectedIdx === 0
                        ? t('rightSidebar.coverText')
                        : (hasStoryTitle(projectState?.global_script || '') && selectedIdx === 1)
                          ? t('rightSidebar.titleText')
                          : t('rightSidebar.bodyText')}
                    </span>
                  </div>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${openSections.text ? 'rotate-180' : ''}`} />
                </button>
                {openSections.text && (
                <div className="flex flex-col gap-3 pt-2">
                      {(() => {
                        const isCover = selectedIdx === 0;
                        const hasTitle = hasStoryTitle(projectState?.global_script || '');
                        const isTitle = hasTitle && selectedIdx === 1;
                        const currentSettings = isCover ? projectState?.cover_text_settings : (isTitle ? projectState?.title_text_settings : projectState?.inner_text_settings);
                        const defaultSettings = { 
                            font_size: isCover ? 40 : (isTitle ? 32 : 20), 
                            text_color: '#ffffff', 
                            font_family: 'serif',
                            font_weight: 400,
                            has_shadow: true,
                            readability_strength: 55,
                            max_width_percent: 90,
                            offset_x: 0,
                            offset_y: 0
                        };
                        const settings = {
                            font_size: currentSettings?.font_size ?? defaultSettings.font_size,
                            text_color: currentSettings?.text_color ?? defaultSettings.text_color,
                            font_family: currentSettings?.font_family ?? defaultSettings.font_family,
                            font_weight: currentSettings?.font_weight ?? defaultSettings.font_weight,
                            has_shadow: currentSettings?.has_shadow ?? defaultSettings.has_shadow,
                            has_backdrop: currentSettings?.has_backdrop ?? false,
                            text_effects: currentSettings?.text_effects,
                            readability_mode: currentSettings?.readability_mode,
                            readability_strength: normalizeTextReadabilityStrength(currentSettings?.readability_strength),
                            max_width_percent: normalizeStoryTextWidthPercent(currentSettings?.max_width_percent),
                            offset_x: currentSettings?.offset_x ?? defaultSettings.offset_x,
                            offset_y: currentSettings?.offset_y ?? defaultSettings.offset_y,
                        };

                        // For inner pages (not cover, not title), per-page overrides for position/color
                        const pageKey = String(selectedIdx);
                        const pageOverride = !isCover && !isTitle ? projectState?.page_text_overrides?.[pageKey] : undefined;

                        // Effective values: per-page overrides take priority for inner pages
                        const effectiveColor = (isCover || isTitle) ? settings.text_color : (pageOverride?.text_color ?? settings.text_color ?? '#ffffff');
                        const effectiveOffsetX = (isCover || isTitle) ? (settings.offset_x || 0) : (pageOverride?.offset_x ?? settings.offset_x ?? 0);
                        const effectiveOffsetY = (isCover || isTitle) ? (settings.offset_y || 0) : (pageOverride?.offset_y ?? settings.offset_y ?? 0);
                        const effectiveReadabilityMode = (isCover || isTitle)
                          ? resolveTextReadabilityMode(settings)
                          : (pageOverride?.readability_mode ?? resolveTextReadabilityMode(settings));
                        const effectiveReadabilityStrength = normalizeTextReadabilityStrength(
                          (isCover || isTitle)
                            ? settings.readability_strength
                            : (pageOverride?.readability_strength ?? settings.readability_strength),
                        );
                        const effectiveMaxWidthPercent = normalizeStoryTextWidthPercent(
                          (isCover || isTitle)
                            ? settings.max_width_percent
                            : (pageOverride?.max_width_percent ?? settings.max_width_percent),
                        );

                        // Update style shared by pages in the same role.
                        const updateSharedSettings = (updates: Partial<TextSettings>) => {
                          if (isCover) {
                            updateProjectState({ cover_text_settings: { ...settings, ...updates } });
                          } else if (isTitle) {
                            updateProjectState({ title_text_settings: { ...settings, ...updates } });
                          } else {
                            updateProjectState({ inner_text_settings: { ...settings, ...updates } });
                          }
                        };

                        // Update scene-dependent properties per page for inner pages.
                        const updatePageOverride = (updates: Partial<PageTextOverride>) => {
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
                      <FontControls
                        fontFamily={settings.font_family}
                        fontWeight={settings.font_weight}
                        systemFonts={systemFonts}
                        onChange={updateSharedSettings}
                      />

                      <SliderControl
                        label={t('rightSidebar.fontSize')}
                        value={settings.font_size}
                        min={12}
                        max={100}
                        step={2}
                        defaultValue={24}
                        unit="px"
                        onChange={(val) => updateSharedSettings({ font_size: val })}
                      />

                      <div className="mt-1 border-t border-border pt-2">
                          <ColorPickerPanel 
                            colors={extractedColors}
                            value={effectiveColor}
                            onChange={(c) => updatePageOverride({ text_color: c })}
                            title={<>{t('rightSidebar.color')}{!isCover && <span className="text-primary/60 ml-1">({t('rightSidebar.currentPage')})</span>}</>}
                          />
                      </div>

                      <TextReadabilityControls
                        effects={pageOverride?.text_effects ?? settings.text_effects}
                        onEffectsChange={text_effects => updatePageOverride({ text_effects })}
                        mode={effectiveReadabilityMode}
                        strength={effectiveReadabilityStrength}
                        maxWidthPercent={effectiveMaxWidthPercent}
                        pageSpecific={!isCover && !isTitle}
                        onModeChange={readabilityMode => updatePageOverride({ readability_mode: readabilityMode, text_effects: { ...effectsFromMode(readabilityMode, effectiveReadabilityStrength), seed: (selectedIdx ?? 0) + 1 } })}
                        onStrengthChange={readabilityStrength => updatePageOverride({ readability_strength: readabilityStrength })}
                        onMaxWidthChange={maxWidthPercent => updatePageOverride({ max_width_percent: maxWidthPercent })}
                      />

                      <div className="flex flex-col gap-3 mt-2 border-t border-border pt-2">
                        {!isCover && (
                          <div className="text-[10px] text-muted-foreground/60 text-center">
                            {t('rightSidebar.pageTextPlacement')}
                          </div>
                        )}
                        <SliderControl
                          label={t('rightSidebar.horizontalOffset')}
                          value={effectiveOffsetX}
                          min={xyBounds.minX}
                          max={xyBounds.maxX}
                          defaultValue={0}
                          unit="px"
                          onChange={(val) => updatePageOverride({ offset_x: val })}
                        />
                        <SliderControl
                          label={t('rightSidebar.verticalOffset')}
                          value={effectiveOffsetY}
                          min={xyBounds.minY}
                          max={xyBounds.maxY}
                          defaultValue={0}
                          unit="px"
                          onChange={(val) => updatePageOverride({ offset_y: val })}
                        />
                      </div>
                      {!isCover && !isTitle && (
                        <SyncTextSettingsDialog 
                          effectiveColor={effectiveColor}
                          effectiveOffsetX={effectiveOffsetX}
                          effectiveOffsetY={effectiveOffsetY}
                          effectiveReadabilityMode={effectiveReadabilityMode}
                          effectiveReadabilityStrength={effectiveReadabilityStrength}
                          effectiveMaxWidthPercent={effectiveMaxWidthPercent}
                          onSync={(opts) => {
                            const overrides = { ...(projectState?.page_text_overrides || {}) };
                            const paragraphs = (globalScript || '').split(/\n\s*\n/).filter((p: string) => p.trim().length > 0);
                            const startIndex = hasTitle ? 2 : 1;
                            const endIndex = paragraphs.length;
                            for (let i = startIndex; i <= endIndex; i++) {
                              if (i === selectedIdx) continue;
                              const currentOverride = { ...overrides[String(i)] };
                              if (opts.color) currentOverride.text_color = effectiveColor;
                              if (opts.offsetX) currentOverride.offset_x = effectiveOffsetX;
                              if (opts.offsetY) currentOverride.offset_y = effectiveOffsetY;
                              if (opts.readability) {
                                currentOverride.readability_mode = effectiveReadabilityMode;
                                currentOverride.readability_strength = effectiveReadabilityStrength;
                                currentOverride.text_effects = pageOverride?.text_effects ?? settings.text_effects;
                              }
                              if (opts.width) currentOverride.max_width_percent = effectiveMaxWidthPercent;
                              overrides[String(i)] = currentOverride;
                            }
                            updateProjectState({ page_text_overrides: overrides });
                          }}
                        />
                      )}
                    </>
                  );
                })()}
                </div>
                )}
              </div>

              {/* Image Adjustments Panel */}
              <div className="border-b border-border pb-2 mt-4">
                <button onClick={() => setOpenSections(s => ({...s, image: !s.image}))} className="flex items-center justify-between w-full py-1.5 hover:text-foreground transition-colors">
                  <div className="flex items-center gap-2">
                    <LayoutTemplate size={14} className="text-emerald-500" />
                    <span className="font-bold text-sm">{t('rightSidebar.imageAdjustments')}</span>
                  </div>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${openSections.image ? 'rotate-180' : ''}`} />
                </button>
                {openSections.image && (
                <div className="flex flex-col gap-3 pt-2">
                  {(() => {
                    const pageKey = String(selectedIdx);
                    const adj = projectState?.image_adjustments?.[pageKey] || {};
                    const scale = adj.scale ?? 1.0;
                    const offsetX = adj.offset_x ?? 0;
                    const offsetY = adj.offset_y ?? 0;
                    const bgColor = adj.bg_color || 'transparent';
                    const brightness = adj.brightness ?? 0;
                    const exposure = adj.exposure ?? 0;
                    const highlights = adj.highlights ?? 0;
                    const shadows = adj.shadows ?? 0;
                    const contrast = adj.contrast ?? 0;
                    const saturate = adj.saturate ?? 0;
                    const temperature = adj.temperature ?? 0;
                    const tint = adj.tint ?? 0;
                    const removeWhiteBg = adj.remove_white_bg ?? 0;
                    const removeBgColor = adj.remove_bg_color || '#ffffff';

                    const updateAdj = (updates: Partial<typeof adj>) => {
                      const existing = projectState?.image_adjustments || {};
                      const current = existing[pageKey] || {};
                      updateProjectState({
                        image_adjustments: { ...existing, [pageKey]: { ...current, ...updates } }
                      });
                    };

                    const resetAdj = () => {
                      const existing = projectState?.image_adjustments || {};
                      const newAdjs = { ...existing };
                      delete newAdjs[pageKey];
                      updateProjectState({ image_adjustments: newAdjs });
                    };

                    const handleCopyAdj = () => {
                      clipboardAdjustments = { ...adj };
                      setHasCopiedAdj(true);
                    };

                    const handlePasteAdj = () => {
                      if (clipboardAdjustments) {
                        const existing = projectState?.image_adjustments || {};
                        const current = existing[pageKey] || {};
                        updateProjectState({
                          image_adjustments: { ...existing, [pageKey]: { ...current, ...clipboardAdjustments } }
                        });
                      }
                    };

                    return (
                      <>
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
                          <button 
                            onClick={handleCopyAdj} 
                            className="flex-1 flex items-center justify-center gap-1.5 py-1 text-xs border border-border rounded bg-muted/50 hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <Copy size={12} />
                            {t('rightSidebar.copyAdjustments')}
                          </button>
                          <button 
                            onClick={handlePasteAdj} 
                            disabled={!hasCopiedAdj}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1 text-xs border border-border rounded bg-muted/50 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ClipboardPaste size={12} />
                            {t('rightSidebar.paste')}
                          </button>
                        </div>
                        <ColorPickerPanel 
                          colors={extractedColors}
                          value={bgColor}
                          onChange={(c) => updateAdj({ bg_color: c })}
                          allowTransparent={true}
                          className="border-b border-border pb-2"
                          title={t('rightSidebar.canvasColor')}
                        />
                        <div className="mt-2 border-b border-border pb-3">
                          <ColorPickerPanel 
                            colors={extractedColors}
                            value={removeBgColor}
                            onChange={(c) => updateAdj({ remove_bg_color: c })}
                            allowTransparent={false}
                            className="pb-2"
                            title={t('rightSidebar.removeColor')}
                          />
                          <SliderControl
                            label={t('rightSidebar.removalStrength')}
                            value={removeWhiteBg}
                            min={0}
                            max={100}
                            step={1}
                            defaultValue={0}
                            onChange={(val) => updateAdj({ remove_white_bg: val })}
                          />
                        </div>
                        <SliderControl
                          label={t('rightSidebar.scale')}
                          value={scale}
                          min={0.1}
                          max={3.0}
                          step={0.05}
                          defaultValue={1.0}
                          unit="x"
                          valueFormat={(v) => v.toFixed(2)}
                          onChange={(val) => updateAdj({ scale: val })}
                        />
                        <SliderControl
                          label={t('rightSidebar.horizontalOffset')}
                          value={offsetX}
                          min={-100}
                          max={100}
                          step={1}
                          defaultValue={0}
                          unit="%"
                          onChange={(val) => updateAdj({ offset_x: val })}
                          className="mt-2"
                        />
                        <SliderControl
                          label={t('rightSidebar.verticalOffset')}
                          value={offsetY}
                          min={-100}
                          max={100}
                          step={1}
                          defaultValue={0}
                          unit="%"
                          onChange={(val) => updateAdj({ offset_y: val })}
                          className="mt-2"
                        />
                        <div className="my-2 border-t border-border pt-3">
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">{t('rightSidebar.colorAdjustment')}</label>
                          <SliderControl
                            label={t('rightSidebar.brightness')}
                            value={brightness}
                            min={-100}
                            max={100}
                            step={1}
                            defaultValue={0}
                            onChange={(val) => updateAdj({ brightness: val })}
                          />
                          <SliderControl
                            label={t('rightSidebar.exposure')}
                            value={exposure}
                            min={-100}
                            max={100}
                            step={1}
                            defaultValue={0}
                            onChange={(val) => updateAdj({ exposure: val })}
                            className="mt-2"
                          />
                          <SliderControl
                            label={t('rightSidebar.highlights')}
                            value={highlights}
                            min={-100}
                            max={100}
                            step={1}
                            defaultValue={0}
                            onChange={(val) => updateAdj({ highlights: val })}
                            className="mt-2"
                          />
                          <SliderControl
                            label={t('rightSidebar.shadows')}
                            value={shadows}
                            min={-100}
                            max={100}
                            step={1}
                            defaultValue={0}
                            onChange={(val) => updateAdj({ shadows: val })}
                            className="mt-2"
                          />
                          <SliderControl
                            label={t('rightSidebar.contrast')}
                            value={contrast}
                            min={-100}
                            max={100}
                            step={1}
                            defaultValue={0}
                            onChange={(val) => updateAdj({ contrast: val })}
                            className="mt-2"
                          />
                          <SliderControl
                            label={t('rightSidebar.saturation')}
                            value={saturate}
                            min={-100}
                            max={100}
                            step={1}
                            defaultValue={0}
                            onChange={(val) => updateAdj({ saturate: val })}
                            className="mt-2"
                          />
                          <SliderControl
                            label={t('rightSidebar.temperature')}
                            value={temperature}
                            min={-100}
                            max={100}
                            step={1}
                            defaultValue={0}
                            onChange={(val) => updateAdj({ temperature: val })}
                            className="mt-2"
                          />
                          <SliderControl
                            label={t('rightSidebar.tint')}
                            value={tint}
                            min={-100}
                            max={100}
                            step={1}
                            defaultValue={0}
                            onChange={(val) => updateAdj({ tint: val })}
                            className="mt-2"
                          />
                        </div>

                        <div className="my-2 border-t border-border pt-3">
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('rightSidebar.selectiveColor')}</label>
                              <button 
                                onClick={() => handleAddSelectiveColor(pageKey)}
                                className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors hover:scale-110" 
                                title={t('rightSidebar.addSelectiveColor')}
                              >
                                <Pipette size={14} />
                              </button>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                              {(() => {
                                const scs = projectState?.image_adjustments?.[pageKey]?.selective_colors || [];
                                if (scs.length === 0) {
                                  return <div className="text-xs text-muted-foreground text-center py-2 bg-muted/30 rounded border border-dashed border-border">{t('rightSidebar.noSelectiveColors')}</div>;
                                }
                                return scs.map(sc => (
                                  <div key={sc.id} className="p-2 border border-border rounded bg-muted/10 relative group">
                                    <button 
                                      onClick={() => handleRemoveSelectiveColor(pageKey, sc.id)}
                                      className="absolute right-2 top-2 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: hueToHex(sc.target_hue) }}></div>
                                      <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1 rounded">{sc.target_hue}°</span>
                                    </div>
                                    <SliderControl
                                      label={t('rightSidebar.hueShift')}
                                      value={sc.d_hue}
                                      min={-180}
                                      max={180}
                                      step={1}
                                      defaultValue={0}
                                      onChange={(val) => handleUpdateSelectiveColor(pageKey, sc.id, { d_hue: val })}
                                    />
                                    <SliderControl
                                      label={t('rightSidebar.localSaturation')}
                                      value={sc.d_sat}
                                      min={-100}
                                      max={100}
                                      step={1}
                                      defaultValue={0}
                                      onChange={(val) => handleUpdateSelectiveColor(pageKey, sc.id, { d_sat: val })}
                                      className="mt-1"
                                    />
                                    <SliderControl
                                      label={t('rightSidebar.localLightness')}
                                      value={sc.d_lum}
                                      min={-100}
                                      max={100}
                                      step={1}
                                      defaultValue={0}
                                      onChange={(val) => handleUpdateSelectiveColor(pageKey, sc.id, { d_lum: val })}
                                      className="mt-1"
                                    />
                                    <SliderControl
                                      label={t('rightSidebar.influenceRange')}
                                      value={sc.range ?? 25}
                                      min={5}
                                      max={90}
                                      step={1}
                                      defaultValue={25}
                                      onChange={(val) => handleUpdateSelectiveColor(pageKey, sc.id, { range: val })}
                                      className="mt-1"
                                    />
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>
                        {(scale !== 1 || offsetX !== 0 || offsetY !== 0 || brightness !== 0 || exposure !== 0 || highlights !== 0 || shadows !== 0 || contrast !== 0 || saturate !== 0 || temperature !== 0 || tint !== 0 || bgColor !== 'transparent' || removeWhiteBg !== 0) && (
                          <button onClick={resetAdj} className="mt-2 text-xs text-red-400 hover:text-red-500 text-right w-full">
                            {t('rightSidebar.reset')}
                          </button>
                        )}
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
