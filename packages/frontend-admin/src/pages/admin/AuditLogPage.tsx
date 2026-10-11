/**
 * AuditLogPage.tsx — TODO: implement
 * Refer to Master PRD Section 4.4 and relevant ADM user stories.
 * The backend route POST /admin/audit-log/query already exists — this page
 * just needs the query UI.
 */
import { PlannedPage } from '../../components/PlannedPage';

export function AuditLogPage() {
  return (
    <PlannedPage title="Audit log"
      blurb="Search platform events (sessions, verification, authoring, publishing) for a date range or module." />
  );
}
