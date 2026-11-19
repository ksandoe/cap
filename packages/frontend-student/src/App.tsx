/**
 * App.tsx — Top-level routing
 *
 * /launch  — receives session token from LTI redirect, bootstraps wizard
 * /wizard  — four-phase wizard (protected, requires session token)
 * /        — fallback / error state
 */
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
const SimSpikePage = lazy(() => import('./spike/SimSpikePage'));
import { LaunchPage }    from './pages/LaunchPage';
import { WizardPage }    from './pages/WizardPage';
import { ErrorPage }     from './pages/ErrorPage';
import { DevLaunchPage } from './pages/DevLaunchPage';

export default function App() {
  return (
    <Routes>
      <Route path="/"       element={<DevLaunchPage />} />
      <Route path="/launch" element={<LaunchPage />} />
      <Route path="/wizard" element={<WizardPage />} />
      <Route path="/sim-spike" element={<Suspense fallback={null}><SimSpikePage /></Suspense>} />
      <Route path="/error"  element={<ErrorPage />} />
      <Route path="*"       element={<Navigate to="/error" />} />
    </Routes>
  );
}
