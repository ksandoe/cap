/**
 * ResearcherLayout.tsx
 * Routes:
 *   /researcher/data     → de-identified data browser (query Aurora research.* schema)
 *   /researcher/export   → dataset export (CSV / JSON)
 *   /researcher/consent  → consent configuration viewer
 *
 * FERPA / IRB note: this module must not be accessible until the
 * administrator has confirmed IRB approval for the relevant module.
 * The backend enforces this; the frontend should surface the IRB
 * status clearly so researchers understand which modules are queryable.
 */
import { Routes, Route } from 'react-router-dom';
import { AppShell }        from '../../components/layout/AppShell';
import { DataBrowserPage } from './DataBrowserPage';
import { ExportPage }      from './ExportPage';
import { ConsentPage }     from './ConsentPage';

export function ResearcherLayout() {
  return (
    <AppShell>
      <Routes>
        <Route path="data"    element={<DataBrowserPage />} />
        <Route path="export"  element={<ExportPage />} />
        <Route path="consent" element={<ConsentPage />} />
        <Route path="*"       element={<DataBrowserPage />} />
      </Routes>
    </AppShell>
  );
}
