/**
 * InstructorLayout.tsx
 * Routes:
 *   /instructor/modules                  → module list + session dashboard
 *   /instructor/modules/:moduleId        → session list for a module
 *   /instructor/sessions/:sessionId      → transcript + evaluation review
 *   /instructor/validation               → recipe validation log
 */
import { Routes, Route } from 'react-router-dom';
import { AppShell }           from '../../components/layout/AppShell';
import { ModuleListPage }     from './ModuleListPage';
import { SessionListPage }    from './SessionListPage';
import { TranscriptPage }     from './TranscriptPage';
import { ValidationLogPage }  from './ValidationLogPage';

export function InstructorLayout() {
  return (
    <AppShell>
      <Routes>
        <Route path="modules"                    element={<ModuleListPage />} />
        <Route path="modules/:moduleId"          element={<SessionListPage />} />
        <Route path="sessions/:sessionId"        element={<TranscriptPage />} />
        <Route path="validation"                 element={<ValidationLogPage />} />
        <Route path="*"                          element={<ModuleListPage />} />
      </Routes>
    </AppShell>
  );
}
