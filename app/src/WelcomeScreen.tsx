import { BookOpen, FolderOpen, Plus, Clock } from 'lucide-react';
import { useProject } from './ProjectContext';


export default function WelcomeScreen() {
    const { createNewProject, openProject, openRecentProject, recentProjects } = useProject();

    const handleOpenRecent = async (path: string) => {
        await openRecentProject(path);
    };

    return (
        <div className="flex flex-col h-screen bg-background text-foreground items-center justify-center p-8">
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
                                <h3 className="font-bold text-lg">新建项目</h3>
                                <p className="text-primary-foreground/80 text-sm">创建一个空白的绘本排版项目</p>
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
                                <h3 className="font-bold text-lg text-foreground">打开项目</h3>
                                <p className="text-muted-foreground text-sm">打开本地的 .scproj 项目文件</p>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Right Side: Recent Projects */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm min-h-[400px] flex flex-col">
                    <div className="flex items-center gap-2 mb-6 text-foreground/80">
                        <Clock size={20} />
                        <h2 className="font-bold text-lg">最近使用的项目</h2>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-2">
                        {recentProjects.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                                暂无最近项目
                            </div>
                        ) : (
                            recentProjects.map((project, idx) => (
                                <button 
                                    key={idx}
                                    onClick={() => handleOpenRecent(project.path)}
                                    className="flex flex-col items-start p-3 rounded-lg hover:bg-muted transition-colors text-left group border border-transparent hover:border-border"
                                >
                                    <span className="font-medium text-foreground group-hover:text-primary transition-colors truncate w-full">
                                        {project.name || "Untitled"}
                                    </span>
                                    <span className="text-xs text-muted-foreground truncate w-full mt-1" title={project.path}>
                                        {project.path}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
