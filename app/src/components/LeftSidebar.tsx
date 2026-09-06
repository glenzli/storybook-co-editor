import { useState, useRef, useEffect } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { LayoutTemplate, Archive, ChevronLeft, ChevronRight, FilePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SortableImageItem, type TextOverlayInfo } from './SortableImageItem';
import { PageImageContextMenu, type PageImageMenuTarget } from './PageImageContextMenu';
import type { ImageAdjustments } from '../project/model';

interface LeftSidebarProps {
  isLeftOpen: boolean;
  setIsLeftOpen: (open: boolean) => void;
  images: string[];
  selectedIdx: number | null;
  setSelectedIdx: (idx: number | null) => void;
  isAiAvailable: boolean;
  handleDelete: (id: string) => void;
  handleMoveToTop?: (idx: number) => void;
  handleMoveToBottom?: (idx: number) => void;
  handleExportImage?: (id: string, idx: number) => void;
  handleCopyToClipboard?: (id: string, idx: number) => void;
  handleOpenTrash: () => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleInsertBlank: () => void;
  handleInsertCodex: () => void;
  handleRedraw: (id: string, idx: number) => void;
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
  isAiAvailable,
  handleDelete,
  handleMoveToTop,
  handleMoveToBottom,
  handleExportImage,
  handleCopyToClipboard,
  handleOpenTrash,
  handleDragEnd,
  handleInsertBlank,
  handleInsertCodex,
  handleRedraw,
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
  const [contextMenu, setContextMenu] = useState<PageImageMenuTarget | null>(null);
  const [isNewPageMenuOpen, setIsNewPageMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('leftSidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
      setIsNewPageMenuOpen(false);
    };
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
    setContextMenu({ x: e.clientX, y: e.clientY, id, index: idx });
    setIsNewPageMenuOpen(false);
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
            <div className="relative">
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  setIsNewPageMenuOpen(open => !open);
                  setContextMenu(null);
                }}
                title={t('sidebar.newPage')}
                className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
              >
                <FilePlus size={16} />
              </button>
              {isNewPageMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[164px] rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      handleInsertBlank();
                      setIsNewPageMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-muted transition-colors"
                  >
                    {t('sidebar.createBlank')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleInsertCodex();
                      setIsNewPageMenuOpen(false);
                    }}
                    disabled={!isAiAvailable}
                    title={!isAiAvailable ? t('ai.unavailable') : undefined}
                    className="w-full px-3 py-1.5 text-left text-primary hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:text-muted-foreground"
                  >
                    {t('sidebar.createWithAi')}
                  </button>
                </div>
              )}
            </div>
            <button onClick={handleOpenTrash} title={t('sidebar.trash')} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors">
              <Archive size={16} />
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
        <PageImageContextMenu
          target={contextMenu}
          pageCount={images.length}
          isAiAvailable={isAiAvailable}
          onDismiss={() => setContextMenu(null)}
          onMoveToTop={handleMoveToTop}
          onMoveToBottom={handleMoveToBottom}
          onRedraw={handleRedraw}
          onCopy={(id, index) => handleCopyToClipboard?.(id, index)}
          onExport={(id, index) => handleExportImage?.(id, index)}
          onDelete={handleDelete}
        />
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
