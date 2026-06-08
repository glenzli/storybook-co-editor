import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2 } from 'lucide-react';

interface SortableImageItemProps {
  id: string;
  idx: number;
  selectedIdx: number | null;
  setSelectedIdx: (idx: number | null) => void;
  onDelete: (id: string) => void;
  hasTitle?: boolean;
}

export function SortableImageItem({ id, idx, selectedIdx, setSelectedIdx, onDelete, hasTitle }: SortableImageItemProps) {
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
      className={`relative group rounded-md border-2 overflow-hidden cursor-pointer transition-colors transition-shadow ${
        selectedIdx === idx ? 'border-primary ring-2 ring-primary/20 shadow-md scale-[1.02]' : 'border-border/50 shadow-sm hover:border-border hover:shadow-md bg-card'
      }`}
    >
      <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm z-10">
        {idx === 0 ? 'Cover' : (hasTitle && idx === 1 ? 'Title' : (hasTitle ? idx - 1 : idx))}
      </div>
      <img 
        src={id.startsWith('blank://') ? 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' : id} 
        alt={`Page ${idx}`} 
        className={`w-full h-auto object-contain rounded-md bg-muted/20 ${id.startsWith('blank://') ? 'bg-white' : ''}`} 
        draggable={false} 
      />
      
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(id); }}
        className="absolute top-1 right-1 p-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-10 backdrop-blur-sm"
        title="删除图片"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
