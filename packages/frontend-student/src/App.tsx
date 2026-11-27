/**
 * App.tsx — Top-level routing
 *
 * /launch  — receives session token from LTI redirect, bootstraps wizard
 * /landing — the page inside a Canvas assignment frame: status and a button that
 *            opens the activity in a new tab (passes straight on when not framed)
 * /wizard  — four-phase wizard (protected, requires session token)
 * /exit    — where leaving the activity ends up (saved, finished, session ended)
 * /        — fallback / error state
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import { LaunchPage }    from './pages/LaunchPage';
import { WizardPage }    from './pages/WizardPage';
import { ErrorPage }     from './pages/ErrorPage';
import { DevLaunchPage } from './pages/DevLaunchPage';
import { ExitPage }      from './pages/ExitPage';
import { LandingPage }   from './pages/LandingPage';

export default function App() {
  return (
    <Routes>
      <Route path="/"       element={<DevLaunchPage />} />
      <Route path="/launch" element={<LaunchPage />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/wizard" element={<WizardPage />} />
      <Route path="/exit"   element={<ExitPage />} />
      <Route path="/error"  element={<ErrorPage />} />
      <Route path="*"       element={<Navigate to="/error" />} />
    </Routes>
  );
}
