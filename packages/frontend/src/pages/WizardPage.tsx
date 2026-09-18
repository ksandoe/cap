/**
 * WizardPage.tsx
 *
 * Orchestrates the four-phase wizard.
 * Phase is tracked in the session store (in-memory, never localStorage).
 *
 * Phase 1 — CheckinPhase
 * Phase 2 — ActivityPhase
 * Phase 3 — CheckoutPhase
 * Phase 4 — SummaryPhase
 */
import { useSessionStore } from '../store/sessionStore';
import { CheckinPhase }   from '../components/wizard/CheckinPhase';
import { ActivityPhase }  from '../components/wizard/ActivityPhase';
import { CheckoutPhase }  from '../components/wizard/CheckoutPhase';
import { SummaryPhase }   from '../components/wizard/SummaryPhase';
import { WizardShell }    from '../components/wizard/WizardShell';

export function WizardPage() {
  const currentPhase = useSessionStore(s => s.currentPhase);

  return (
    <WizardShell currentPhase={currentPhase}>
      {currentPhase === 1 && <CheckinPhase />}
      {currentPhase === 2 && <ActivityPhase />}
      {currentPhase === 3 && <CheckoutPhase />}
      {currentPhase === 4 && <SummaryPhase />}
    </WizardShell>
  );
}
