/**
 * ModuleConfigPage.tsx — TODO: implement
 * Refer to Master PRD Section 4.4 and relevant ADM user stories.
 * Backend routes GET/POST /admin/module-config already exist.
 */
import { PlannedPage } from '../../components/PlannedPage';

export function ModuleConfigPage() {
  return (
    <PlannedPage title="Module config"
      blurb="Per-module operational settings (SAP pool assignment, timing, feature flags)." />
  );
}
