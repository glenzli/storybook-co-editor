import { useState } from 'react';
import { BookOpen, FolderOpen, Plus, Clock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProject } from './ProjectContext';
import { LicenseNoticeButton } from './components/LicenseNoticeButton';
import { LanguageSwitcher } from './components/LanguageSwitcher';


export default function WelcomeScreen() {
    const { t } = useTranslation();
    const { createNewProject, openProject, openRecentProject, removeRecentProject, recentProjects } = useProject();
    const [removingPath, setRemovingPath] = useState<string | null>(null);
    const [removeError, setRemoveError] = useState('');

    const handleOpenRecent = async (path: string) => {
        await openRecentProject(path);
    };

    const handleRemoveRecent = async (path: string) => {
        setRemovingPath(path);
        setRemoveError('');
        try {
            await removeRecentProject(path);
        } catch {
            setRemoveError(t('welcome.removeRecentFailure'));
        } finally {
            setRemovingPath(null);
        }
    };

    return (
        <div className="relative flex flex-col h-screen bg-background text-foreground items-center justify-center p-8">
            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
                
                {/* Left Side: Actions */}
                <div className="flex flex-col gap-8">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3 text-primary mb-2">
                            <BookOpen size={40} />
                            <h1 className="text-4xl font-bold tracking-tight">Storybook</h1>
                        </div>
                        <p className="text-xl text-muted-foreground font-light">Co-Editor</p>
                    </div>

                    <div className="flex flex-col gap-4 mt-4">
                        <button 
                            onClick={createNewProject}
                            className="flex items-center gap-4 bg-primary text-primary-foreground p-4 rounded-xl hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 group"
                        >
                            <div className="bg-primary-foreground/20 p-2 rounded-lg group-hover:scale-110 transition-transform">
                                <Plus size={24} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-lg">{t('welcome.newProject')}</h3>
                                <p className="text-primary-foreground/80 text-sm">{t('welcome.newProjectDescription')}</p>
                            </div>
                        </button>

                        <button 
                            onClick={openProject}
                            className="flex items-center gap-4 bg-card border border-border p-4 rounded-xl hover:bg-muted transition-all shadow-sm hover:shadow-md group"
                        >
                            <div className="bg-muted p-2 rounded-lg group-hover:bg-background transition-colors">
                                <FolderOpen size={24} className="text-foreground/80" />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-lg text-foreground">{t('welcome.openProject')}</h3>
                                <p className="text-muted-foreground text-sm">{t('welcome.openProjectDescription')}</p>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Right Side: Recent Projects */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm min-h-[400px] flex flex-col">
                    <div className="flex items-center gap-2 mb-2 text-foreground/80">
                        <Clock size={20} />
                        <h2 className="font-bold text-lg">{t('welcome.recentProjects')}</h2>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">{t('welcome.removeRecentHint')}</p>
                    {removeError && <p role="alert" className="text-xs text-destructive mb-3">{removeError}</p>}

                    <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-2">
                        {recentProjects.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                                {t('welcome.noRecentProjects')}
                            </div>
                        ) : (
                            recentProjects.map(project => (
                                <div
                                    key={project.path}
                                    className="flex items-center rounded-lg hover:bg-muted transition-colors group border border-transparent hover:border-border"
                                >
                                    <button type="button" onClick={() => handleOpenRecent(project.path)}
                                        disabled={removingPath !== null}
                                        className="flex flex-1 min-w-0 flex-col items-start p-3 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
                                        <span className="font-medium text-foreground group-hover:text-primary transition-colors truncate w-full">
                                            {project.name || t('common.untitled')}
                                        </span>
                                        <span className="text-xs text-muted-foreground truncate w-full mt-1" title={project.path}>
                                            {project.path}
                                        </span>
                                    </button>
                                    <button type="button" onClick={() => handleRemoveRecent(project.path)}
                                        disabled={removingPath !== null}
                                        aria-label={t('welcome.removeRecentLabel', { name: project.name || t('common.untitled') })}
                                        title={t('welcome.removeRecentProject')}
                                        className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40">
                                        <X size={16} aria-hidden="true" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
            <div className="absolute right-5 top-5">
                <LanguageSwitcher />
            </div>
            <div className="absolute bottom-5 right-5">
                <LicenseNoticeButton className="text-muted-foreground hover:bg-muted hover:text-foreground" />
            </div>
        </div>
    );
}
