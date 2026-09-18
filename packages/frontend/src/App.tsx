/**
 * App.tsx — Top-level routing
 *
 * /launch  — receives session token from LTI redirect, bootstraps wizard
 * /wizard  — four-phase wizard (protected, requires session token)
 * /        — fallback / error state
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import { LaunchPage }  from './pages/LaunchPage';
import { WizardPage }  from './pages/WizardPage';
import { ErrorPage }   from './pages/ErrorPage';

export default function App() {
  return (
    <Routes>
      <Route path="/launch" element={<LaunchPage />} />
      <Route path="/wizard" element={<WizardPage />} />
      <Route path="/error"  element={<ErrorPage />} />
      <Route path="*"       element={<Navigate to="/error" />} />
    </Routes>
  );
}
