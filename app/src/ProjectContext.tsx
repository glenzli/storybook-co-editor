/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { localizeAppError } from './i18n';
import type { ProjectInfo, ProjectState } from './project/model';
import { migrateProjectState } from './project/migrate';
import { ProjectHistory, sameProjectContent } from './project/history';
import {
    dispatchExternalProjectUpdate,
    type ExternalProjectUpdate,
} from './project/externalUpdates';
import {
    loadRecentProjects,
    saveRecentProjects,
    withRecentProject,
    type RecentProject,
} from './project/recentProjects';

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
    appendSourceUrlMap: (stableId: string, filename: string) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
    const { t } = useTranslation();
    const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
    const [projectState, setProjectState] = useState<ProjectState | null>(null);
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveProgress, setSaveProgress] = useState<{ current: number, total: number } | null>(null);
    const historyRef = useRef(new ProjectHistory<ProjectState>(value => structuredClone(value), 50, sameProjectContent));
    const historyWorkspaceRef = useRef<string | null>(null);
    const activeWorkspaceRef = useRef<string | null>(null);
    const pendingExternalUpdateRef = useRef<ExternalProjectUpdate | null>(null);
    const isUndoRedoRef = useRef(false);
    const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });
    const navigate = useNavigate();
    const refreshHistoryAvailability = useCallback(() => {
        setHistoryAvailability({
            canUndo: historyRef.current.canUndo,
            canRedo: historyRef.current.canRedo,
        });
    }, []);

    useEffect(() => {
        activeWorkspaceRef.current = activeWorkspaceId;
    }, [activeWorkspaceId]);

    useEffect(() => {
        loadRecentProjects().then(setRecentProjects).catch(console.error);

        const unlisten = listen<ProjectInfo>('project-auto-created', (event) => {
            setActiveWorkspaceId(event.payload.workspace_id);
            setProjectState(migrateProjectState(event.payload.state));
            setCurrentProjectPath(null);
            navigate('/editor');
        });

        const unlistenProgress = listen<{ current: number, total: number }>('save-progress', (event) => {
            setSaveProgress(event.payload);
        });

        const unlistenExternalUpdate = listen<ExternalProjectUpdate>('external-project-update', (event) => {
            if (event.payload.workspace_id !== activeWorkspaceRef.current) return;
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            const update = {
                ...event.payload,
                state: migrateProjectState(event.payload.state),
            };
            pendingExternalUpdateRef.current = update;
            setProjectState(update.state);
            setIsDirty(true);
        });

        return () => {
            unlisten.then(f => f());
            unlistenProgress.then(f => f());
            unlistenExternalUpdate.then(f => f());
        };
    }, [navigate]);

    useEffect(() => {
        const update = pendingExternalUpdateRef.current;
        if (!update || !projectState) return;
        pendingExternalUpdateRef.current = null;
        dispatchExternalProjectUpdate(update);
    }, [projectState]);

    const addRecentProject = async (path: string, name: string) => {
        const next = withRecentProject(recentProjects, path, name);
        await saveRecentProjects(next);
        setRecentProjects(next);
    };

    const createNewProject = async () => {
        try {
            const info = await invoke<ProjectInfo>('create_project');
            setActiveWorkspaceId(info.workspace_id);
            setProjectState(migrateProjectState(info.state));
            setCurrentProjectPath(null);
            navigate('/editor');
        } catch (e) {
            console.error("Failed to create project", e);
        }
    };

    const openProject = async () => {
        try {
            const filePath = await open({
                filters: [{ name: t('common.projectFile'), extensions: ['scproj'] }]
            });
            if (filePath && typeof filePath === 'string') {
                const info = await invoke<ProjectInfo>('open_project', { archivePath: filePath });
                setActiveWorkspaceId(info.workspace_id);
                setProjectState(migrateProjectState(info.state));
                setCurrentProjectPath(filePath);
                await addRecentProject(filePath, info.state.project_name);
                navigate('/editor');
            }
        } catch (e) {
            console.error("Failed to open project", e);
            alert(t('project.openFailure', { error: localizeAppError(e) }));
        }
    };

    const openRecentProject = async (filePath: string) => {
        try {
            const info = await invoke<ProjectInfo>('open_project', { archivePath: filePath });
            setActiveWorkspaceId(info.workspace_id);
            setProjectState(migrateProjectState(info.state));
            setCurrentProjectPath(filePath);
            await addRecentProject(filePath, info.state.project_name);
            navigate('/editor');
        } catch (e) {
            console.error("Failed to open recent project", e);
            alert(t('project.openRecentFailure', { error: localizeAppError(e) }));
        }
    };

    const saveProjectAs = async () => {
        if (isSaving) return;
        setIsSaving(true);
        setSaveProgress({ current: 0, total: 1 });
        try {
            const filePath = await save({
                filters: [{ name: t('common.projectFile'), extensions: ['scproj'] }]
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
            alert(t('project.saveAsFailure', { error: localizeAppError(e) }));
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
            alert(t('project.saveFailure', { error: localizeAppError(e) }));
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
            invoke('update_project_state', { state: projectState }).catch(error => {
                if (String(error) !== 'STALE_PROJECT_STATE') console.error(error);
            });
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

    const appendSourceUrlMap = useCallback((stableId: string, filename: string) => {
        setProjectState(prev => {
            if (!prev) return null;
            const newMap = { ...(prev.source_url_map || {}) };
            newMap[stableId] = filename;
            return { ...prev, source_url_map: newMap, last_modified: new Date().toISOString() };
        });
        setIsDirty(true);
    }, []);

    // Project history has the same lifecycle as the active workspace.
    useEffect(() => {
        if (historyWorkspaceRef.current !== activeWorkspaceId) {
            historyWorkspaceRef.current = activeWorkspaceId;
            historyRef.current.reset(projectState ?? undefined);
            isUndoRedoRef.current = false;
            refreshHistoryAvailability();
            return;
        }
        if (!projectState) {
            historyRef.current.reset();
            refreshHistoryAvailability();
            return;
        }
        if (isUndoRedoRef.current) {
            isUndoRedoRef.current = false;
            return;
        }
        historyRef.current.push(projectState);
        refreshHistoryAvailability();
    }, [activeWorkspaceId, projectState, refreshHistoryAvailability]);

    const { canUndo, canRedo } = historyAvailability;

    const undo = useCallback(() => {
        const previous = historyRef.current.undo();
        if (!previous) return;
        isUndoRedoRef.current = true;
        setProjectState(previous);
        setIsDirty(true);
        refreshHistoryAvailability();
    }, [refreshHistoryAvailability]);

    const redo = useCallback(() => {
        const next = historyRef.current.redo();
        if (!next) return;
        isUndoRedoRef.current = true;
        setProjectState(next);
        setIsDirty(true);
        refreshHistoryAvailability();
    }, [refreshHistoryAvailability]);

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
            appendSourceUrlMap,
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
