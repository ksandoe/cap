/**
 * App.tsx — Admin App top-level routing
 *
 * The Admin App is a role-gated, directly-accessed application.
 * It is NOT launched via LTI. Users log in via institutional SSO
 * or platform-managed credentials.
 *
 * Route structure:
 *   /login                    — Login / SSO redirect
 *   /author/*                 — Domain expert: recipe authoring
 *   /instructor/*             — Instructor: module dashboards, transcripts
 *   /researcher/*             — Researcher: de-identified data browser
 *   /admin/*                  — Administrator: pool, config, audit log
 *
 * All routes except /login require authentication.
 * Role-based route guards redirect unauthorized users to /login.
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage }        from './pages/LoginPage';
import { AuthorLayout }     from './pages/author/AuthorLayout';
import { InstructorLayout } from './pages/instructor/InstructorLayout';
import { ResearcherLayout } from './pages/researcher/ResearcherLayout';
import { AdminLayout }      from './pages/admin/AdminLayout';
import { RequireAuth }      from './components/layout/RequireAuth';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth roles={['author', 'instructor', 'admin', 'researcher']} />}>
        <Route path="/author/*"     element={<AuthorLayout />} />
        <Route path="/instructor/*" element={<InstructorLayout />} />
        <Route path="/researcher/*" element={<ResearcherLayout />} />
        <Route path="/admin/*"      element={<AdminLayout />} />
        <Route path="/"             element={<Navigate to="/author" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
