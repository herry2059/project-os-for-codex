import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AppShell from './components/AppShell';
import { getAuthState, logout, type AuthState } from './lib/api';
import DashboardPage from './pages/DashboardPage';
import MyNextPage from './pages/MyNextPage';
import ProjectListPage from './pages/ProjectListPage';
import NewProjectPage from './pages/NewProjectPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import HandoffPage from './pages/HandoffPage';
import RetroPage from './pages/RetroPage';
import KnowledgePage from './pages/KnowledgePage';
import SettingsPage from './pages/SettingsPage';
import GuidePage from './pages/GuidePage';
import WorkspacePage from './pages/WorkspacePage';
import ProfilePage from './pages/ProfilePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LegalPage from './pages/LegalPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ErrorBoundary from './components/ErrorBoundary';
import { Empty } from './components/ui';

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);

  const refreshAuth = () => {
    getAuthState().then(setAuth);
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  if (!auth) {
    return (
      <div className="h-full bg-[#020203]">
        <Empty text="Connecting to the system…" />
      </div>
    );
  }

  if (!auth.authenticated) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/register" element={<RegisterPage onDone={refreshAuth} />} />
          <Route path="/forgot" element={<ForgotPasswordPage />} />
          <Route path="/legal" element={<LegalPage />} />
          <Route path="*" element={<LoginPage onLogin={refreshAuth} />} />
        </Routes>
      </ErrorBoundary>
    );
  }

  const onLogout = async () => {
    await logout();
    refreshAuth();
  };

  return (
    <AppShell user={auth.user} onLogout={onLogout}>
      <ErrorBoundary>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/next" element={<MyNextPage />} />
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/projects/new" element={<NewProjectPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/projects/:id/handoff" element={<HandoffPage />} />
        <Route path="/projects/:id/retro" element={<RetroPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
    </AppShell>
  );
}
