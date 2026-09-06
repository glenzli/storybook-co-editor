import { memo, useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThumbnail } from '../hooks/useThumbnail';
import type { ProAdjustments } from '../utils/imageProcessor';
import type { ImageAdjustments } from '../project/model';
import { StoryTextOverlay } from './StoryTextOverlay';
import type { StoryTextLayer } from '../utils/storyPageRenderer';

interface SortableImageItemProps {
  id: string;
  idx: number;
  isSelected: boolean;
  onSelect: (idx: number) => void;
  onDelete: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, id: string, idx: number) => void;
  hasTitle?: boolean;
  imageAdjustment?: ImageAdjustments;
  textOverlays?: StoryTextLayer[];
  canvasSize?: number; // canvas width for scaling text
}


export const SortableImageItem = memo(function SortableImageItem({ id, idx, isSelected, onSelect, onDelete, onContextMenu, hasTitle, imageAdjustment, textOverlays, canvasSize }: SortableImageItemProps) {
  const { t } = useTranslation();
  const pageRef = useRef<HTMLDivElement>(null);
  const [textScale, setTextScale] = useState(0.2);
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
    remove_white_bg: adj.remove_white_bg ?? 0,
    remove_bg_color: adj.remove_bg_color,
  } : undefined;

  const hasAdj = scale !== 1 || offsetX !== 0 || offsetY !== 0 ||
    (adjustments && (
      adjustments.brightness !== 0 || adjustments.exposure !== 0 || adjustments.highlights !== 0 ||
      adjustments.shadows !== 0 || adjustments.contrast !== 0 || adjustments.saturate !== 0 ||
      adjustments.temperature !== 0 || adjustments.tint !== 0 || adjustments.remove_white_bg !== 0 ||
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

  useEffect(() => {
    const element = pageRef.current;
    if (!element) return;
    const update = () => {
      if (element.offsetWidth > 0) {
        setTextScale(element.offsetWidth / (canvasSize || 1024));
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [canvasSize]);

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
      <div ref={pageRef} className="relative w-full overflow-hidden" style={{ backgroundColor: bgColor !== 'transparent' ? bgColor : undefined }}>
        <img 
          src={displaySrc} 
          alt={`Page ${idx}`} 
          className={`w-full h-auto object-contain rounded-md ${id.startsWith('blank://') ? 'bg-white' : ''}`} 
          draggable={false} 
        />
        {/* Cover/title text uses the same rendering component as the main canvas. */}
        {textOverlays?.map(layer => (
          <StoryTextOverlay key={layer.id} layer={layer} scale={textScale} />
        ))}
      </div>
      
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(id); }}
        className="absolute top-1 right-1 p-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-10 backdrop-blur-sm"
        title={t('sidebar.deleteImage')}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
});
