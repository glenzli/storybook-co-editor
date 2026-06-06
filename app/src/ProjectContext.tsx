import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { load } from '@tauri-apps/plugin-store';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useNavigate } from 'react-router-dom';

export interface TextSettings {
    font_family: string;
    font_size: number;
    text_color: string;
}

export interface PrintSettings {
    paper_size: 'A4' | 'A3';
    paper_orientation: 'portrait' | 'landscape';
    book_size: 'A5' | 'A4';
    layout_mode: '1-up' | '2-up';
    binding_method: 'perfect' | 'saddle' | 'butterfly';
    has_back_cover: boolean;
    spine_mm: number;
    binding_margin_mm: number;
    crop_marks: boolean;
    offset_x: number;
    offset_y: number;
}

export interface ProjectState {
    project_name: string;
    last_modified: string;
    visible_images: string[];
    trashed_images: string[];
    global_script: string;
    cover_text_settings?: TextSettings;
    inner_text_settings?: TextSettings;
    print_settings?: PrintSettings;
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
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
    const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
    const [projectState, setProjectState] = useState<ProjectState | null>(null);
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        // Load recent projects
        const loadRecent = async () => {
            const store = await load('settings.json', { autoSave: false });
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

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const saveRecentToStore = async (projects: RecentProject[]) => {
        const store = await load('settings.json', { autoSave: false });
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
        }
    };

    const saveProjectAs = async () => {
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
            }
        } catch (e) {
            console.error("Failed to save project as", e);
        }
    };

    const saveProject = async (path?: string) => {
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
        } else {
            await saveProjectAs();
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

    const updateProjectState = (newState: Partial<ProjectState>) => {
        setProjectState(prev => {
            if (!prev) return null;
            return { ...prev, ...newState, last_modified: new Date().toISOString() };
        });
    };

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
