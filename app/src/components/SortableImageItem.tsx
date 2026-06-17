import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2 } from 'lucide-react';
import { useThumbnail } from '../hooks/useThumbnail';
import type { ProAdjustments } from '../utils/imageProcessor';

export interface TextOverlayInfo {
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  hasShadow: boolean;
  hasBackdrop: boolean;
  strokeColor: string;
  offsetX: number;
  offsetY: number;
}

interface SortableImageItemProps {
  id: string;
  idx: number;
  isSelected: boolean;
  onSelect: (idx: number) => void;
  onDelete: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, id: string, idx: number) => void;
  hasTitle?: boolean;
  imageAdjustment?: {
    scale?: number;
    offset_x?: number;
    offset_y?: number;
    bg_color?: string;
    brightness?: number;
    exposure?: number;
    highlights?: number;
    shadows?: number;
    contrast?: number;
    saturate?: number;
    temperature?: number;
    tint?: number;
    selective_colors?: any[];
  };
  textOverlays?: TextOverlayInfo[];
  canvasSize?: number; // canvas width for scaling text
}


export const SortableImageItem = memo(function SortableImageItem({ id, idx, isSelected, onSelect, onDelete, onContextMenu, hasTitle, imageAdjustment, textOverlays, canvasSize }: SortableImageItemProps) {
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

  const adj = imageAdjustment;
  const scale = adj?.scale ?? 1;
  const offsetX = adj?.offset_x ?? 0;
  const offsetY = adj?.offset_y ?? 0;
  const bgColor = adj?.bg_color || 'transparent';
  const adjustments: ProAdjustments | undefined = adj ? {
    brightness: adj.brightness ?? 0,
    exposure: adj.exposure ?? 0,
    highlights: adj.highlights ?? 0,
    shadows: adj.shadows ?? 0,
    contrast: adj.contrast ?? 0,
    saturate: adj.saturate ?? 0,
    temperature: adj.temperature ?? 0,
    tint: adj.tint ?? 0,
    selective_colors: adj.selective_colors || [],
  } : undefined;

  const hasAdj = scale !== 1 || offsetX !== 0 || offsetY !== 0 ||
    (adjustments && (
      adjustments.brightness !== 0 || adjustments.exposure !== 0 || adjustments.highlights !== 0 ||
      adjustments.shadows !== 0 || adjustments.contrast !== 0 || adjustments.saturate !== 0 ||
      adjustments.temperature !== 0 || adjustments.tint !== 0 ||
      (adjustments.selective_colors && adjustments.selective_colors.length > 0)
    ));

  const rawSrc = id.startsWith('blank://') ? 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' : id;

  const thumb = useThumbnail(
    hasAdj ? rawSrc : '',
    adjustments,
    scale,
    offsetX,
    offsetY,
    bgColor,
  );

  const displaySrc = hasAdj && thumb ? thumb : rawSrc;

  return (
    <div 
      id={`sidebar-item-${idx}`}
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      onClick={() => onSelect(idx)}
      onContextMenu={(e) => onContextMenu?.(e, id, idx)}
      className={`relative group rounded-md border-2 overflow-hidden cursor-pointer transition-colors transition-shadow ${
        isSelected ? 'border-primary ring-2 ring-primary/20 shadow-md scale-[1.02]' : 'border-border/50 shadow-sm hover:border-border hover:shadow-md bg-card'
      }`}
    >
      <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm z-10">
        {idx === 0 ? 'Cover' : (hasTitle && idx === 1 ? 'Title' : (hasTitle ? idx - 1 : idx))}
      </div>
      <div className="relative w-full overflow-hidden" style={{ backgroundColor: bgColor !== 'transparent' ? bgColor : undefined }}>
        <img 
          src={displaySrc} 
          alt={`Page ${idx}`} 
          className={`w-full h-auto object-contain rounded-md ${id.startsWith('blank://') ? 'bg-white' : ''}`} 
          draggable={false} 
        />
        {/* Text overlay — Cover/Title only */}
        {textOverlays && textOverlays.length > 0 && (() => {
          const cw = canvasSize || 1024;
          return (
            <div
              ref={(el) => {
                if (!el) return;
                const update = () => {
                  const w = el.offsetWidth;
                  if (w > 0) el.style.setProperty('--s', String(w / cw));
                };
                update();
                // Observe resize for sidebar drag
                const ro = new ResizeObserver(update);
                ro.observe(el);
                (el as any).__ro = ro;
              }}
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                paddingBottom: `${(40 / cw) * 100}%`,
                paddingLeft: `${(48 / cw) * 100}%`,
                paddingRight: `${(48 / cw) * 100}%`,
                pointerEvents: 'none',
                gap: '1px',
              }}
            >
              {textOverlays.map((t, i) => {
                const fs = t.fontSize;
                return (
                  <div key={i} className="text-center whitespace-pre-wrap" style={{
                    fontFamily: t.fontFamily,
                    fontSize: `calc(${fs} * var(--s, 0.2) * 1px)`,
                    lineHeight: 1.5,
                    color: t.color,
                    ...(t.hasBackdrop ? {
                      background: t.strokeColor.replace('0.8)', '0.35)'),
                      padding: `calc(${fs * 0.2} * var(--s, 0.2) * 1px) calc(${fs * 0.5} * var(--s, 0.2) * 1px)`,
                      borderRadius: `calc(${fs * 0.3} * var(--s, 0.2) * 1px)`,
                    } : {}),
                    ...(t.hasShadow ? {
                      WebkitTextStroke: `calc(${fs * 0.04} * var(--s, 0.2) * 1px) ${t.strokeColor}`,
                      paintOrder: 'stroke fill',
                    } : {}),
                    maxWidth: '100%',
                  }}>
                    {t.text}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
      
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(id); }}
        className="absolute top-1 right-1 p-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-10 backdrop-blur-sm"
        title="删除图片"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
});
