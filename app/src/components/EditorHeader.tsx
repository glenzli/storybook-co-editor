import { useEffect, useRef, useState } from 'react';
import { Bot, FileBox, Undo2, Redo2, Save, FolderOpen, XCircle, Loader2, Download, BookMarked, Package, Moon, Sun, Settings, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProjectState } from '../project/model';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LicenseNoticeButton } from './LicenseNoticeButton';

const MENU_ITEM_CLASS = 'flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground/40';

interface EditorHeaderProps {
  projectState: ProjectState | null;
  isDirty: boolean;
  currentProjectPath: string | null;
  activeTab: 'edit' | 'print';
  setActiveTab: (tab: 'edit' | 'print') => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveProject: () => void;
  saveProjectAs: () => void;
  closeProject: () => void;
  isSaving?: boolean;
  saveProgress?: { current: number, total: number } | null;
  exportElectronicPdf: () => void;
  electronicPdfProgress?: { current: number, total: number } | null;
  exportWebPublication: () => void;
  webPublicationProgress?: { current: number, total: number } | null;
  isPublicationExportBusy: boolean;
  openPublicationMetadata: () => void;
  hasPublicationMetadata: boolean;
  openAiIntegration: () => void;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
}

export function EditorHeader({
  projectState,
  isDirty,
  currentProjectPath,
  activeTab,
  setActiveTab,
  undo,
  redo,
  canUndo,
  canRedo,
  saveProject,
  saveProjectAs,
  closeProject,
  isSaving,
  saveProgress,
  exportElectronicPdf,
  electronicPdfProgress,
  exportWebPublication,
  webPublicationProgress,
  isPublicationExportBusy,
  openPublicationMetadata,
  hasPublicationMetadata,
  openAiIntegration,
  isDark,
  setIsDark,
}: EditorHeaderProps) {
  const { t } = useTranslation();
  const [activeMenu, setActiveMenu] = useState<'publication' | 'settings' | null>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const exportProgress = webPublicationProgress || electronicPdfProgress;

  useEffect(() => {
    if (!activeMenu) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (!menuRootRef.current?.contains(event.target as Node)) setActiveMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveMenu(null);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenu]);

  const runMenuAction = (action: () => void) => {
    setActiveMenu(null);
    action();
  };

  return (
    <header className="h-12 bg-card border-b border-border flex items-center justify-between px-4 text-sm flex-shrink-0 relative z-30 shadow-sm">
      <div className="flex items-center gap-4 w-1/3">
          <span className="font-semibold text-primary flex items-center gap-2">
              <FileBox size={16} />
              {projectState?.project_name || t('common.untitled')}
              {isDirty && !isSaving && <span className="w-2 h-2 rounded-full bg-amber-500" title={t('header.unsavedChanges')} />}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={currentProjectPath || t('header.unsaved')}>
                {currentProjectPath ? currentProjectPath.split('/').pop() : `(${t('header.unsaved')})`}
            </span>
            {isSaving && (
              <span className="text-[11px] text-primary font-medium flex items-center gap-1 ml-1 bg-primary/10 px-1.5 py-0.5 rounded">
                <Loader2 size={10} className="animate-spin" />
                {t('header.saving', { progress: saveProgress ? `${Math.round((saveProgress.current / saveProgress.total) * 100)}%` : '...' })}
              </span>
            )}
          </div>
      </div>

      <div className="flex items-center justify-center gap-1 bg-muted p-1 rounded-md border border-border w-1/3 max-w-[200px]">
          <button 
              onClick={() => setActiveTab('edit')}
              className={`flex-1 py-1 px-3 rounded text-xs font-medium transition-colors ${activeTab === 'edit' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10'}`}
          >
              {t('header.edit')}
          </button>
          <button 
              onClick={() => setActiveTab('print')}
              className={`flex-1 py-1 px-3 rounded text-xs font-medium transition-colors ${activeTab === 'print' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10'}`}
          >
              {t('header.print')}
          </button>
      </div>

      <div className="flex items-center justify-end gap-1 w-1/3">
          <button onClick={undo} disabled={!canUndo} className={`p-1.5 rounded-md transition-colors ${canUndo ? 'hover:bg-muted text-foreground' : 'text-muted-foreground/30 cursor-not-allowed'}`} title={t('header.undo')}>
              <Undo2 size={14} />
          </button>
          <button onClick={redo} disabled={!canRedo} className={`p-1.5 rounded-md transition-colors ${canRedo ? 'hover:bg-muted text-foreground' : 'text-muted-foreground/30 cursor-not-allowed'}`} title={t('header.redo')}>
              <Redo2 size={14} />
          </button>
          <div className="w-px h-4 bg-border mx-1"></div>
          <button 
            onClick={() => { if (isDirty && !isSaving) saveProject(); }}
            disabled={!isDirty || isSaving}
            className={`p-1.5 rounded-md transition-colors ${isSaving ? 'text-primary animate-pulse' : isDirty ? 'hover:bg-muted text-primary' : 'text-muted-foreground/30 cursor-not-allowed'}`}
            title={isSaving ? t('header.savingShort') : isDirty ? t('header.save') : t('header.saved')}
          >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          </button>
          <button 
            onClick={saveProjectAs} 
            disabled={isSaving}
            className={`p-1.5 rounded-md transition-colors ${isSaving ? 'text-muted-foreground/30 cursor-not-allowed' : 'hover:bg-muted text-foreground'}`} 
            title={t('header.saveAs')}
          >
              <FolderOpen size={14} />
          </button>
          <div className="w-px h-4 bg-border mx-1"></div>
          <div ref={menuRootRef} className="flex items-center gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu(menu => menu === 'publication' ? null : 'publication')}
                className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${activeMenu === 'publication' || exportProgress ? 'bg-muted text-primary' : 'text-foreground hover:bg-muted'}`}
                title={exportProgress
                  ? webPublicationProgress
                    ? t('header.exportingWebPublication', webPublicationProgress)
                    : t('header.exportingElectronicPdf', electronicPdfProgress!)
                  : t('header.publish')}
                aria-haspopup="true"
                aria-expanded={activeMenu === 'publication'}
              >
                {exportProgress ? <Loader2 size={14} className="animate-spin" /> : <BookMarked size={14} />}
                <span>{t('header.publish')}</span>
                <ChevronDown size={12} className={`transition-transform ${activeMenu === 'publication' ? 'rotate-180' : ''}`} />
              </button>
              {activeMenu === 'publication' && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg">
                  <button
                    type="button"
                    onClick={() => runMenuAction(openPublicationMetadata)}
                    className={MENU_ITEM_CLASS}
                  >
                    <BookMarked size={14} className={hasPublicationMetadata ? 'text-primary' : 'text-muted-foreground'} />
                    <span>{t('header.publication')}</span>
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={() => runMenuAction(exportElectronicPdf)}
                    disabled={isPublicationExportBusy}
                    className={MENU_ITEM_CLASS}
                  >
                    {electronicPdfProgress ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} className="text-muted-foreground" />}
                    <span>{t('header.exportElectronicPdf')}</span>
                    {electronicPdfProgress && <span className="ml-auto text-[11px]">{electronicPdfProgress.current}/{electronicPdfProgress.total}</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => runMenuAction(exportWebPublication)}
                    disabled={isPublicationExportBusy}
                    className={MENU_ITEM_CLASS}
                  >
                    {webPublicationProgress ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} className="text-muted-foreground" />}
                    <span>{t('header.exportWebPublication')}</span>
                    {webPublicationProgress && <span className="ml-auto text-[11px]">{webPublicationProgress.current}/{webPublicationProgress.total}</span>}
                  </button>
                </div>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu(menu => menu === 'settings' ? null : 'settings')}
                className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${activeMenu === 'settings' ? 'bg-muted text-primary' : 'text-foreground hover:bg-muted'}`}
                title={t('header.settings')}
                aria-haspopup="true"
                aria-expanded={activeMenu === 'settings'}
              >
                <Settings size={14} />
                <span>{t('header.settings')}</span>
                <ChevronDown size={12} className={`transition-transform ${activeMenu === 'settings' ? 'rotate-180' : ''}`} />
              </button>
              {activeMenu === 'settings' && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg">
                  <button
                    type="button"
                    onClick={() => runMenuAction(openAiIntegration)}
                    className={MENU_ITEM_CLASS}
                  >
                    <Bot size={14} className="text-muted-foreground" />
                    <span>{t('header.aiIntegration')}</span>
                  </button>
                  <div className="my-1 border-t border-border" />
                  <LanguageSwitcher menuItem onSelect={() => setActiveMenu(null)} />
                  <button
                    type="button"
                    onClick={() => setIsDark(!isDark)}
                    className={MENU_ITEM_CLASS}
                  >
                    {isDark ? <Sun size={14} className="text-muted-foreground" /> : <Moon size={14} className="text-muted-foreground" />}
                    <span>{t(isDark ? 'sidebar.lightMode' : 'sidebar.darkMode')}</span>
                  </button>
                  <div className="my-1 border-t border-border" />
                  <LicenseNoticeButton menuItem className="hover:bg-muted" />
                </div>
              )}
            </div>
          </div>
          <button onClick={closeProject} className="p-1.5 rounded-md hover:bg-red-500/10 text-red-500 transition-colors" title={t('header.closeProject')}>
              <XCircle size={14} />
          </button>
      </div>
    </header>
  );
}
