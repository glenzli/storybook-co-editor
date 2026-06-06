import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProjectProvider, useProject } from './ProjectContext';
import WelcomeScreen from './WelcomeScreen';
import EditorScreen from './EditorScreen';

function AppRoutes() {
    const { activeWorkspaceId } = useProject();

    return (
        <Routes>
            <Route path="/" element={<WelcomeScreen />} />
            <Route 
                path="/editor" 
                element={activeWorkspaceId ? <EditorScreen /> : <Navigate to="/" replace />} 
            />
        </Routes>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <ProjectProvider>
                <AppRoutes />
            </ProjectProvider>
        </BrowserRouter>
    );
}
