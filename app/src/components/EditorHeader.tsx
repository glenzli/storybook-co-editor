import { FileBox, Undo2, Redo2, Save, FolderOpen, XCircle } from 'lucide-react';

interface EditorHeaderProps {
  projectState: any;
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
  closeProject
}: EditorHeaderProps) {
  return (
    <header className="h-12 bg-card border-b border-border flex items-center justify-between px-4 text-sm flex-shrink-0 relative z-30 shadow-sm">
      <div className="flex items-center gap-4 w-1/3">
          <span className="font-semibold text-primary flex items-center gap-2">
              <FileBox size={16} />
              {projectState?.project_name || "Untitled"}
              {isDirty && <span className="w-2 h-2 rounded-full bg-amber-500" title="有未保存的修改" />}
          </span>
          <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={currentProjectPath || "未保存"}>
              {currentProjectPath ? currentProjectPath.split('/').pop() : "(未保存)"}
          </span>
      </div>

      <div className="flex items-center justify-center gap-1 bg-muted p-1 rounded-md border border-border w-1/3 max-w-[200px]">
          <button 
              onClick={() => setActiveTab('edit')}
              className={`flex-1 py-1 px-3 rounded text-xs font-medium transition-colors ${activeTab === 'edit' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10'}`}
          >
              内容编辑
          </button>
          <button 
              onClick={() => setActiveTab('print')}
              className={`flex-1 py-1 px-3 rounded text-xs font-medium transition-colors ${activeTab === 'print' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10'}`}
          >
              印前拼版
          </button>
      </div>

      <div className="flex items-center justify-end gap-1 w-1/3">
          <button onClick={undo} disabled={!canUndo} className={`p-1.5 rounded-md transition-colors ${canUndo ? 'hover:bg-muted text-foreground' : 'text-muted-foreground/30 cursor-not-allowed'}`} title="撤销 (Cmd+Z)">
              <Undo2 size={14} />
          </button>
          <button onClick={redo} disabled={!canRedo} className={`p-1.5 rounded-md transition-colors ${canRedo ? 'hover:bg-muted text-foreground' : 'text-muted-foreground/30 cursor-not-allowed'}`} title="重做 (Cmd+Shift+Z)">
              <Redo2 size={14} />
          </button>
          <div className="w-px h-4 bg-border mx-1"></div>
          <button 
            onClick={() => { if (isDirty) saveProject(); }}
            disabled={!isDirty}
            className={`p-1.5 rounded-md transition-colors ${isDirty ? 'hover:bg-muted text-primary' : 'text-muted-foreground/30 cursor-not-allowed'}`}
            title={isDirty ? "保存 (Cmd+S)" : "已保存"}
          >
              <Save size={14} />
          </button>
          <button onClick={saveProjectAs} className="p-1.5 rounded-md hover:bg-muted text-foreground transition-colors" title="另存为...">
              <FolderOpen size={14} />
          </button>
          <div className="w-px h-4 bg-border mx-1"></div>
          <button onClick={closeProject} className="p-1.5 rounded-md hover:bg-red-500/10 text-red-500 transition-colors" title="关闭项目">
              <XCircle size={14} />
          </button>
      </div>
    </header>
  );
}
