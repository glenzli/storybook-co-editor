import { useState, useRef, useEffect } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { LayoutTemplate, Archive, Sun, Moon, ChevronLeft, ChevronRight, FilePlus, ArrowUpToLine, ArrowDownToLine, Trash2, Download, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SortableImageItem, type TextOverlayInfo } from './SortableImageItem';
import type { ImageAdjustments } from '../ProjectContext';

interface LeftSidebarProps {
  isLeftOpen: boolean;
  setIsLeftOpen: (open: boolean) => void;
  images: string[];
  selectedIdx: number | null;
  setSelectedIdx: (idx: number | null) => void;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  handleDelete: (id: string) => void;
  handleMoveToTop?: (idx: number) => void;
  handleMoveToBottom?: (idx: number) => void;
  handleExportImage?: (id: string, idx: number) => void;
  handleCopyToClipboard?: (id: string, idx: number) => void;
  handleOpenTrash: () => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleInsertBlank: () => void;
  hasTitle?: boolean;
  imageAdjustments?: Record<string, ImageAdjustments>;
  textOverlays?: Record<number, TextOverlayInfo[]>;
  canvasSize?: number;
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
  handleMoveToTop,
  handleMoveToBottom,
  handleExportImage,
  handleCopyToClipboard,
  handleOpenTrash,
  handleDragEnd,
  handleInsertBlank,
  hasTitle,
  imageAdjustments,
  textOverlays,
  canvasSize
}: LeftSidebarProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [sidebarWidth, setSidebarWidth] = useState(() => parseInt(localStorage.getItem('leftSidebarWidth') || '256', 10));
  const [isDraggingState, setIsDraggingState] = useState(false);
  const isDragging = useRef(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string, idx: number } | null>(null);

  useEffect(() => {
    localStorage.setItem('leftSidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

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

  const onContextMenu = (e: React.MouseEvent, id: string, idx: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, id, idx });
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
            <h2 className="font-bold whitespace-nowrap">{t('sidebar.pages')}</h2>
          </div>
          <div className="flex gap-1">
            <button onClick={handleInsertBlank} title={t('sidebar.insertBlank')} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors">
              <FilePlus size={16} />
            </button>
            <button onClick={handleOpenTrash} title={t('sidebar.trash')} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors">
              <Archive size={16} />
            </button>
            <button onClick={() => setIsDark(!isDark)} title={t(isDark ? 'sidebar.lightMode' : 'sidebar.darkMode')} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors">
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 w-full relative">
          {images.length === 0 ? (
            <div className="text-muted-foreground text-sm text-center mt-10">
              {t('sidebar.noPages')}<br/>{t('sidebar.sendFromExtension')}
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
                    onContextMenu={onContextMenu}
                    hasTitle={hasTitle}
                    imageAdjustment={imageAdjustments?.[String(idx)]}
                    textOverlays={textOverlays?.[idx]}
                    canvasSize={canvasSize}
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

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-[100] bg-popover border border-border shadow-lg rounded-md py-1 min-w-[140px] text-sm text-popover-foreground"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button 
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-muted transition-colors disabled:opacity-50"
            disabled={contextMenu.idx === 0}
            onClick={() => {
              handleMoveToTop?.(contextMenu.idx);
              setContextMenu(null);
            }}
          >
            <ArrowUpToLine size={14} />
            {t('sidebar.moveTop')}
          </button>
          <button 
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-muted transition-colors disabled:opacity-50"
            disabled={contextMenu.idx === images.length - 1}
            onClick={() => {
              handleMoveToBottom?.(contextMenu.idx);
              setContextMenu(null);
            }}
          >
            <ArrowDownToLine size={14} />
            {t('sidebar.moveBottom')}
          </button>
          <button 
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-muted transition-colors"
            onClick={() => {
              handleCopyToClipboard?.(contextMenu.id, contextMenu.idx);
              setContextMenu(null);
            }}
          >
            <Copy size={14} />
            {t('sidebar.copyImage')}
          </button>
          <div className="h-px bg-border my-1" />
          <button 
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-muted transition-colors"
            onClick={() => {
              handleExportImage?.(contextMenu.id, contextMenu.idx);
              setContextMenu(null);
            }}
          >
            <Download size={14} />
            {t('sidebar.exportOriginal')}
          </button>
          <button 
            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-red-500/10 text-red-500 transition-colors"
            onClick={() => {
              handleDelete(contextMenu.id);
              setContextMenu(null);
            }}
          >
            <Trash2 size={14} />
            {t('common.delete')}
          </button>
        </div>
      )}

      {/* Left Sidebar Toggle Button */}
      <button 
        onClick={() => setIsLeftOpen(!isLeftOpen)}
        title={t(isLeftOpen ? 'sidebar.collapse' : 'sidebar.expand')}
        style={{ left: isLeftOpen ? sidebarWidth : 0 }}
        className={`absolute top-1/2 -translate-y-1/2 z-30 bg-card border border-border rounded-r-md shadow-md p-1 hover:bg-muted ${!isDraggingState ? 'transition-all duration-300' : ''}`}
      >
        {isLeftOpen ? <ChevronLeft size={20} className="text-muted-foreground" /> : <ChevronRight size={20} className="text-muted-foreground" />}
      </button>
    </>
  );
}
