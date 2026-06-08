import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { LayoutTemplate, Trash2, Sun, Moon, ChevronLeft, ChevronRight, FilePlus } from 'lucide-react';
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
  handleInsertBlank
}: LeftSidebarProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <>
      <aside className={`overflow-hidden border-r border-border bg-card flex flex-col z-20 shadow-xl transition-all duration-300 ease-in-out ${isLeftOpen ? 'w-64 min-w-[256px]' : 'w-0'}`}>
        <div className="p-4 border-b border-border flex items-center justify-between w-64">
          <div className="flex items-center gap-2">
            <LayoutTemplate size={20} className="text-primary" />
            <h2 className="font-bold whitespace-nowrap">绘本分页</h2>
          </div>
          <div className="flex gap-1">
            <button onClick={handleInsertBlank} title="插入空白页" className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors">
              <FilePlus size={16} />
            </button>
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
    </>
  );
}
