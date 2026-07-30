import { FileBox, Undo2, Redo2, Save, FolderOpen, XCircle, Loader2, FileDown, BookMarked } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProjectState } from '../ProjectContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LicenseNoticeButton } from './LicenseNoticeButton';

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
  openPublicationMetadata: () => void;
  hasPublicationMetadata: boolean;
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
  openPublicationMetadata,
  hasPublicationMetadata,
}: EditorHeaderProps) {
  const { t } = useTranslation();

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
          <button
            type="button"
            onClick={openPublicationMetadata}
            className={`p-1.5 rounded-md transition-colors ${hasPublicationMetadata ? 'text-primary hover:bg-muted' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            title={t('header.publication')}
            aria-label={t('header.publication')}
          >
              <BookMarked size={14} />
          </button>
          <button
            onClick={exportElectronicPdf}
            disabled={Boolean(electronicPdfProgress)}
            className={`p-1.5 rounded-md transition-colors ${electronicPdfProgress ? 'text-primary' : 'hover:bg-muted text-foreground'}`}
            title={electronicPdfProgress
              ? t('header.exportingElectronicPdf', electronicPdfProgress)
              : t('header.exportElectronicPdf')}
          >
              {electronicPdfProgress ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
          </button>
          <div className="w-px h-4 bg-border mx-1"></div>
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
          <LanguageSwitcher compact className="max-w-[82px]" />
          <LicenseNoticeButton compact className="text-muted-foreground hover:bg-muted hover:text-foreground" />
          <button onClick={closeProject} className="p-1.5 rounded-md hover:bg-red-500/10 text-red-500 transition-colors" title={t('header.closeProject')}>
              <XCircle size={14} />
          </button>
      </div>
    </header>
  );
}
