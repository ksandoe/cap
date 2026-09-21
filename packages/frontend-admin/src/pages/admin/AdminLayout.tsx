/**
 * AdminLayout.tsx
 * Routes:
 *   /admin/modules      → module configuration list
 *   /admin/modules/:id  → module configuration form
 *   /admin/sap-pool     → SAP pool status and management
 *   /admin/audit-log    → audit event log browser
 *   /admin/health       → integration health dashboard
 *   /admin/irb          → IRB approval configuration
 */
import { Routes, Route } from 'react-router-dom';
import { AppShell }            from '../../components/layout/AppShell';
import { ModuleConfigPage }    from './ModuleConfigPage';
import { SapPoolPage }         from './SapPoolPage';
import { AuditLogPage }        from './AuditLogPage';
import { HealthPage }          from './HealthPage';
import { IrbConfigPage }       from './IrbConfigPage';

export function AdminLayout() {
  return (
    <AppShell>
      <Routes>
        <Route path="modules"      element={<ModuleConfigPage />} />
        <Route path="modules/:id"  element={<ModuleConfigPage />} />
        <Route path="sap-pool"     element={<SapPoolPage />} />
        <Route path="audit-log"    element={<AuditLogPage />} />
        <Route path="health"       element={<HealthPage />} />
        <Route path="irb"          element={<IrbConfigPage />} />
        <Route path="*"            element={<ModuleConfigPage />} />
      </Routes>
    </AppShell>
  );
}
