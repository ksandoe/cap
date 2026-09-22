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
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../store/sessionStore';
import { api } from '../services/api';
import { CheckinPhase }   from '../components/wizard/CheckinPhase';
import { ActivityPhase }  from '../components/wizard/ActivityPhase';
import { CheckoutPhase }  from '../components/wizard/CheckoutPhase';
import { SummaryPhase }   from '../components/wizard/SummaryPhase';
import { WizardShell }    from '../components/wizard/WizardShell';

export function WizardPage() {
  const currentPhase = useSessionStore(s => s.currentPhase);
  const token        = useSessionStore(s => s.token);
  const sessionId    = useSessionStore(s => s.sessionId);
  const moduleId     = useSessionStore(s => s.moduleId);
  const setPhase     = useSessionStore(s => s.setPhase);
  const setRecipe    = useSessionStore(s => s.setRecipe);
  const setAttempt   = useSessionStore(s => s.setAttemptNumber);
  const navigate     = useNavigate();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !sessionId) { navigate('/error?code=NO_TOKEN'); return; }

    // Refresh session state (resume may have happened server-side) and load the recipe
    (async () => {
      try {
        const session = await api.session.get(sessionId);
        if (session.phaseReached) setPhase(session.phaseReached);
        if (session.attemptNumber) setAttempt(session.attemptNumber);
        if (moduleId) {
          const recipe = await api.recipe.get(moduleId);
          setRecipe(recipe);
        }
      } catch (e: any) {
        // Ephemeral demo store: sessions can disappear on redeploys/instance
        // recycling while the JWT is still valid. Bounce back to the launchpad
        // instead of dead-ending on an error.
        if (String(e.message).includes('SESSION_NOT_FOUND')) {
          navigate('/', { replace: true, state: { notice: 'Your previous session expired — pick a persona and relaunch.' } });
          return;
        }
        setError(`Could not load your session. ${e.message}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <WizardShell currentPhase={currentPhase}>
        <div className="notice error" role="alert">{error}</div>
      </WizardShell>
    );
  }

  return (
    <WizardShell currentPhase={currentPhase}>
      {currentPhase === 1 && <CheckinPhase />}
      {currentPhase === 2 && <ActivityPhase />}
      {currentPhase === 3 && <CheckoutPhase />}
      {currentPhase === 4 && <SummaryPhase />}
    </WizardShell>
  );
}
