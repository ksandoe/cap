/**
 * IrbConfigPage.tsx — TODO: implement
 * Refer to Master PRD Section 4.4 and relevant ADM user stories.
 *
 * Lives under Researcher (v3.1): IRB approval gates researcher data
 * access, so it belongs with consent/export rather than platform admin.
 */
import { PlannedPage } from '../../components/PlannedPage';

export function IrbConfigPage() {
  return (
    <PlannedPage title="IRB approval"
      blurb="Record IRB approval per module — required before researcher data access is enabled." />
  );
}
