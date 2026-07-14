import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TeamProvider } from './context/TeamContext';
import ProtectedRoute from './routes/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import TeamListPage from './pages/TeamListPage';
import TeamMembersPage from './pages/TeamMembersPage';
import TeamWorkspacePage from './pages/TeamWorkspacePage';

export default function App() {
  return (
    <AuthProvider>
      <TeamProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/teams" element={<TeamListPage />} />
            <Route path="/teams/:teamId/members" element={<TeamMembersPage />} />
            <Route path="/teams/:teamId" element={<TeamWorkspacePage />} />
          </Route>

          <Route path="/" element={<Navigate to="/teams" replace />} />
        </Routes>
      </TeamProvider>
    </AuthProvider>
  );
}
