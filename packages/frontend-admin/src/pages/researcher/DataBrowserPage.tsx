/**
 * DataBrowserPage.tsx — TODO: implement
 * Refer to user stories RES-01 through RES-03 and Master PRD Section 4.3 and 5.4.
 *
 * IMPORTANT: all data displayed here must be de-identified.
 * No direct student identifiers (name, email, Canvas UUID, SAP username)
 * may appear anywhere in this module. Data is linked by research cohort ID only.
 */
import { PlannedPage } from '../../components/PlannedPage';

export function DataBrowserPage() {
  return (
    <PlannedPage title="Data browser"
      blurb="Query de-identified session and evaluation records for approved research."
      notice={{ title: 'IRB requirement', body: 'Research data is only available for modules with confirmed IRB approval.' }} />
  );
}
