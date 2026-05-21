import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import CoursesPage from './pages/CoursesPage';
import ProfilePage from './pages/ProfilePage';
import PerformancePage from './pages/PerformancePage';
import FeedbackPage from './pages/FeedbackPage';
import PulsePage from './pages/PulsePage';
import CommunityPage from './pages/CommunityPage';
import EkipYonetimi from './pages/EkipYonetimi';
import AdminPage from './pages/AdminPage';
import MeetingPage from './pages/MeetingPage';
import SystemLogsPage from './pages/SystemLogsPage';
import LibraryPage from './pages/LibraryPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-brand-lightGray">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        <p className="text-brand-gray text-sm">Yükleniyor...</p>
      </div>
    </div>
  );
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user, isAdmin } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/home" replace /> : <LoginPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        {/* Çıplak "/" daima "/home"a yönlendirilir — Sidebar vurgusu doğru çalışsın */}
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="profile" element={isAdmin ? <Navigate to="/home" replace /> : <ProfilePage />} />
        <Route path="performance" element={<PerformancePage />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="pulse" element={<PulsePage />} />
        <Route path="community" element={<CommunityPage />} />
        <Route path="team" element={<EkipYonetimi />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="meeting" element={<MeetingPage />} />
        <Route path="meeting/:meetingId" element={<MeetingPage />} />
        <Route path="logs" element={<SystemLogsPage />} />
        <Route path="library" element={<LibraryPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
