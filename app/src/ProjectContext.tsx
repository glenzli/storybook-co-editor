/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { load } from '@tauri-apps/plugin-store';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useNavigate } from 'react-router-dom';

export interface TextSettings {
    font_size?: number;
    text_color?: string;
    font_family?: string;
    has_shadow?: boolean;
    offset_x?: number;
    offset_y?: number;
}

export interface ImageAdjustments {
    offset_x?: number;
    offset_y?: number;
    scale?: number;
    bg_color?: string;
}

export interface PrintSettings {
    paper_size: 'A5' | 'A4' | 'A3';
    paper_orientation: 'portrait' | 'landscape';
    book_size: 'A5' | 'A4';
    layout_mode: '1-up' | '2-up';
    binding_method: 'perfect' | 'saddle' | 'butterfly';
    has_back_cover: boolean;
    spine_mm: number;
    binding_margin_mm: number;
    hardware_margin_mm: number;
    crop_marks: boolean;
    offset_x: number;
    offset_y: number;
    paper_alignment: 'center' | 'left' | 'top-left';
    auto_snap_content: boolean;
}

export interface ProjectState {
    project_name: string;
    last_modified: string;
    visible_images: string[];
    trashed_images: string[];
    global_script: string;
    cover_text_settings?: TextSettings;
    title_text_settings?: TextSettings;
    inner_text_settings?: TextSettings;
    image_adjustments?: Record<string, ImageAdjustments>;
    print_settings?: PrintSettings;
    canvas_width: number;
    canvas_height: number;
    author_name?: string;
    author_text_settings?: TextSettings;
    page_text_overrides?: Record<string, { offset_x: number; offset_y: number; text_color?: string }>;
}

export interface ProjectInfo {
    workspace_id: string;
    state: ProjectState;
}

interface RecentProject {
    path: string;
    name: string;
    lastOpened: number;
}

interface ProjectContextType {
    activeWorkspaceId: string | null;
    projectState: ProjectState | null;
    recentProjects: RecentProject[];
    createNewProject: () => Promise<void>;
    openProject: () => Promise<void>;
    openRecentProject: (path: string) => Promise<void>;
    saveProjectAs: () => Promise<void>;
    saveProject: (path?: string) => Promise<void>;
    closeProject: () => Promise<void>;
    updateProjectState: (newState: Partial<ProjectState>) => void;
    currentProjectPath: string | null;
    isDirty: boolean;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    isSaving: boolean;
    saveProgress: { current: number, total: number } | null;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
    const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
    const [projectState, setProjectState] = useState<ProjectState | null>(null);
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveProgress, setSaveProgress] = useState<{ current: number, total: number } | null>(null);
    // Undo/Redo history
    const historyRef = useRef<ProjectState[]>([]);
    const historyIndexRef = useRef(-1);
    const isUndoRedoRef = useRef(false);
    const MAX_HISTORY = 50;
    const navigate = useNavigate();

    useEffect(() => {
        // Load recent projects
        const loadRecent = async () => {
            const store = await load('settings.json', { autoSave: false } as any);
            const recent = await store.get<RecentProject[]>('recentProjects');
            if (recent) setRecentProjects(recent);
        };
        loadRecent();

        const unlisten = listen<{ workspace_id: string }>('project-auto-created', async (event) => {
            try {
                // Fetch the newly created state
                const res = await fetch('http://127.0.0.1:14320/api/project/state');
                const data = await res.json();
                if (data.success && data.state) {
                    setActiveWorkspaceId(event.payload.workspace_id);
                    setProjectState(data.state);
                    setCurrentProjectPath(null);
                    navigate('/editor');
                }
            } catch (e) {
                console.error("Failed to sync auto-created project", e);
            }
        });

        const unlistenProgress = listen<{ current: number, total: number }>('save-progress', (event) => {
            setSaveProgress(event.payload);
        });

        return () => {
            unlisten.then(f => f());
            unlistenProgress.then(f => f());
        };
    }, []);

    const saveRecentToStore = async (projects: RecentProject[]) => {
        const store = await load('settings.json', { autoSave: false } as any);
        await store.set('recentProjects', projects);
        await store.save();
        setRecentProjects(projects);
    };

    const addRecentProject = async (path: string, name: string) => {
        const filtered = recentProjects.filter(p => p.path !== path);
        const newRecent = [{ path, name, lastOpened: Date.now() }, ...filtered].slice(0, 10);
        await saveRecentToStore(newRecent);
    };

    const createNewProject = async () => {
        try {
            const info = await invoke<ProjectInfo>('create_project');
            setActiveWorkspaceId(info.workspace_id);
            setProjectState(info.state);
            setCurrentProjectPath(null);
            navigate('/editor');
        } catch (e) {
            console.error("Failed to create project", e);
        }
    };

    const openProject = async () => {
        try {
            const filePath = await open({
                filters: [{ name: 'Storybook Co-Editor Project', extensions: ['scproj'] }]
            });
            if (filePath && typeof filePath === 'string') {
                const info = await invoke<ProjectInfo>('open_project', { archivePath: filePath });
                setActiveWorkspaceId(info.workspace_id);
                setProjectState(info.state);
                setCurrentProjectPath(filePath);
                await addRecentProject(filePath, info.state.project_name);
                navigate('/editor');
            }
        } catch (e) {
            console.error("Failed to open project", e);
            alert("无法打开项目: " + (typeof e === 'string' ? e : (e as Error)?.message || String(e)));
        }
    };

    const openRecentProject = async (filePath: string) => {
        try {
            const info = await invoke<ProjectInfo>('open_project', { archivePath: filePath });
            setActiveWorkspaceId(info.workspace_id);
            setProjectState(info.state);
            setCurrentProjectPath(filePath);
            await addRecentProject(filePath, info.state.project_name);
            navigate('/editor');
        } catch (e) {
            console.error("Failed to open recent project", e);
            alert("无法打开最近的项目: " + (typeof e === 'string' ? e : (e as Error)?.message || String(e)));
        }
    };

    const saveProjectAs = async () => {
        if (isSaving) return;
        setIsSaving(true);
        setSaveProgress({ current: 0, total: 1 });
        try {
            const filePath = await save({
                filters: [{ name: 'Storybook Co-Editor Project', extensions: ['scproj'] }]
            });
            if (filePath) {
                const filename = filePath.split(/[/\\]/).pop() || 'Untitled';
                const newProjectName = filename.replace(/\.scproj$/, '');
                
                if (projectState) {
                    const updatedState = { ...projectState, project_name: newProjectName, last_modified: new Date().toISOString() };
                    await invoke('update_project_state', { state: updatedState });
                    setProjectState(updatedState);
                }
                
                await invoke('save_project', { targetPath: filePath });
                setCurrentProjectPath(filePath);
                
                await addRecentProject(filePath, newProjectName);
                setIsDirty(false);
            }
        } catch (e) {
            console.error("Failed to save project as", e);
            alert("另存为项目失败: " + (typeof e === 'string' ? e : (e as Error)?.message || String(e)));
        } finally {
            setIsSaving(false);
            setSaveProgress(null);
        }
    };

    const saveProject = async (path?: string) => {
        if (isSaving) return;
        setIsSaving(true);
        setSaveProgress({ current: 0, total: 1 });
        try {
            const targetPath = path || currentProjectPath;
            if (targetPath) {
                const filename = targetPath.split(/[/\\]/).pop() || 'Untitled';
                const projectName = filename.replace(/\.scproj$/, '');
                
                if (projectState) {
                    const updatedState = { ...projectState, project_name: projectName, last_modified: new Date().toISOString() };
                    await invoke('update_project_state', { state: updatedState });
                    setProjectState(updatedState);
                }
                
                await invoke('save_project', { targetPath });
                setCurrentProjectPath(targetPath);
                await addRecentProject(targetPath, projectName);
                setIsDirty(false);
            } else {
                await saveProjectAs();
            }
        } catch (e) {
            console.error("Failed to save project", e);
            alert("保存项目失败: " + (typeof e === 'string' ? e : (e as Error)?.message || String(e)));
        } finally {
            setIsSaving(false);
            setSaveProgress(null);
        }
    };

    const closeProject = async () => {
        await invoke('close_project');
        setActiveWorkspaceId(null);
        setProjectState(null);
        setCurrentProjectPath(null);
        navigate('/');
    };

    useEffect(() => {
        if (!projectState || !activeWorkspaceId) return;
        
        if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
        }
        
        syncTimeoutRef.current = setTimeout(() => {
            invoke('update_project_state', { state: projectState }).catch(console.error);
        }, 300);
        
        return () => {
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        };
    }, [projectState, activeWorkspaceId]);

    const updateProjectState = useCallback((newState: Partial<ProjectState>) => {
        setProjectState(prev => {
            if (!prev) return null;
            const updated = { ...prev, ...newState, last_modified: new Date().toISOString() };
            return updated;
        });
        setIsDirty(true);
    }, []);

    // Push to undo history when projectState changes (skip undo/redo-triggered changes)
    useEffect(() => {
        if (!projectState) return;
        if (isUndoRedoRef.current) {
            isUndoRedoRef.current = false;
            return;
        }
        const history = historyRef.current;
        const idx = historyIndexRef.current;
        // Trim forward history on new edit
        historyRef.current = history.slice(0, idx + 1);
        historyRef.current.push(JSON.parse(JSON.stringify(projectState)));
        if (historyRef.current.length > MAX_HISTORY) {
            historyRef.current = historyRef.current.slice(-MAX_HISTORY);
        }
        historyIndexRef.current = historyRef.current.length - 1;
    }, [projectState]);

    // eslint-disable-next-line react-hooks/refs
    const canUndo = historyIndexRef.current > 0;
    // eslint-disable-next-line react-hooks/refs
    const canRedo = historyIndexRef.current < historyRef.current.length - 1;

    const undo = useCallback(() => {
        if (historyIndexRef.current <= 0) return;
        historyIndexRef.current -= 1;
        isUndoRedoRef.current = true;
        setProjectState(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
        setIsDirty(true);
    }, []);

    const redo = useCallback(() => {
        if (historyIndexRef.current >= historyRef.current.length - 1) return;
        historyIndexRef.current += 1;
        isUndoRedoRef.current = true;
        setProjectState(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
        setIsDirty(true);
    }, []);

    // Auto-save: 5s after last edit, if dirty and has a save path
    useEffect(() => {
        if (!isDirty || !currentProjectPath) return;
        if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = setTimeout(() => {
            saveProject().then(() => setIsDirty(false));
        }, 5000);
        return () => {
            if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDirty, projectState, currentProjectPath]);

    return (
        <ProjectContext.Provider value={{
            activeWorkspaceId,
            projectState,
            recentProjects,
            createNewProject,
            openProject,
            openRecentProject,
            saveProjectAs,
            saveProject,
            closeProject,
            updateProjectState,
            currentProjectPath,
            isDirty,
            undo,
            redo,
            canUndo,
            canRedo,
            isSaving,
            saveProgress
        }}>
            {children}
        </ProjectContext.Provider>
    );
};

export const useProject = () => {
    const context = useContext(ProjectContext);
    if (context === undefined) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
};
