import { useState, useRef, useEffect } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { LayoutTemplate, Archive, Sun, Moon, ChevronLeft, ChevronRight, FilePlus } from 'lucide-react';
import { SortableImageItem } from './SortableImageItem';

interface LeftSidebarProps {
  isLeftOpen: boolean;
  setIsLeftOpen: (open: boolean) => void;
  images: string[];
  selectedIdx: number | null;
  setSelectedIdx: (idx: number | null) => void;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  handleDelete: (id: string) => void;
  handleOpenTrash: () => void;
  handleDragEnd: (event: any) => void;
  handleInsertBlank: () => void;
  hasTitle?: boolean;
}

export function LeftSidebar({
  isLeftOpen,
  setIsLeftOpen,
  images,
  selectedIdx,
  setSelectedIdx,
  isDark,
  setIsDark,
  handleDelete,
  handleOpenTrash,
  handleDragEnd,
  handleInsertBlank,
  hasTitle
}: LeftSidebarProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [sidebarWidth, setSidebarWidth] = useState(() => parseInt(localStorage.getItem('leftSidebarWidth') || '256', 10));
  const [isDraggingState, setIsDraggingState] = useState(false);
  const isDragging = useRef(false);

  useEffect(() => {
    localStorage.setItem('leftSidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      let newWidth = e.clientX;
      if (newWidth < 160) newWidth = 160;
      if (newWidth > 600) newWidth = 600;
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

  return (
    <>
      <aside 
        className={`relative overflow-hidden border-r border-border bg-card flex flex-col z-20 shadow-xl ${!isDraggingState ? 'transition-all duration-300 ease-in-out' : ''}`}
        style={{ width: isLeftOpen ? sidebarWidth : 0 }}
      >
        <div className="p-4 border-b border-border flex items-center justify-between w-full shrink-0">
          <div className="flex items-center gap-2">
            <LayoutTemplate size={20} className="text-primary" />
            <h2 className="font-bold whitespace-nowrap">绘本分页</h2>
          </div>
          <div className="flex gap-1">
            <button onClick={handleInsertBlank} title="插入空白页" className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors">
              <FilePlus size={16} />
            </button>
            <button onClick={handleOpenTrash} title="回收站" className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors">
              <Archive size={16} />
            </button>
            <button onClick={() => setIsDark(!isDark)} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors">
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 w-full">
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
                    isSelected={selectedIdx === idx}
                    onSelect={setSelectedIdx}
                    onDelete={handleDelete}
                    hasTitle={hasTitle}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Resizer Handle */}
        <div 
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/50 active:bg-primary z-50 transition-colors"
          onMouseDown={handleMouseDown}
        />
      </aside>

      {/* Left Sidebar Toggle Button */}
      <button 
        onClick={() => setIsLeftOpen(!isLeftOpen)}
        style={{ left: isLeftOpen ? sidebarWidth : 0 }}
        className={`absolute top-1/2 -translate-y-1/2 z-30 bg-card border border-border rounded-r-md shadow-md p-1 hover:bg-muted ${!isDraggingState ? 'transition-all duration-300' : ''}`}
      >
        {isLeftOpen ? <ChevronLeft size={20} className="text-muted-foreground" /> : <ChevronRight size={20} className="text-muted-foreground" />}
      </button>
    </>
  );
}
