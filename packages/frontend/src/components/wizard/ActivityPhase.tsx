/**
 * ActivityPhase.tsx — Phase 2: activity instructions.
 *
 * Shows the content stub (summary + resource links) and the numbered
 * activity steps. Understanding notes are never shown to the student.
 *
 * "I have completed the activity" → confirmation → POST verify-sap →
 * poll verify-status every 3s → advance on SAP_VERIFIED, or show which
 * document types are missing / a connectivity error and allow retry.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useSessionStore } from '../../store/sessionStore';

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS  = 60_000; // client-side ceiling; SAP query itself times out server-side

export function ActivityPhase() {
  const sessionId = useSessionStore(s => s.sessionId);
  const recipe    = useSessionStore(s => s.recipe);
  const setPhase  = useSessionStore(s => s.setPhase);

  const [confirming, setConfirming] = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function startVerification() {
    if (!sessionId || verifying) return;
    setConfirming(false);
    setVerifying(true);
    setError(null);
    try {
      await api.session.verifySap(sessionId);
    } catch (e: any) {
      setError('Verification could not be started. Please try again in a moment.');
      setVerifying(false);
      return;
    }

    const started = Date.now();
    pollRef.current = setInterval(async () => {
      try {
        const { status, sapVerificationError } = await api.session.verifyStatus(sessionId!);
        if (status === 'SAP_VERIFIED') {
          stopPolling();
          setPhase(3);
        } else if (status === 'ACTIVITY' && sapVerificationError) {
          stopPolling();
          const missing = sapVerificationError.missingTypes?.length
            ? `The following items weren't found yet: ${sapVerificationError.missingTypes.join(', ')}. ` +
              'Complete them and try again.'
            : 'The system that checks your work is temporarily unavailable. Please try again in a few minutes.';
          setError(missing);
        } else if (Date.now() - started > POLL_TIMEOUT_MS) {
          stopPolling();
          setError('Verification is taking longer than expected. Please try again.');
        }
      } catch {
        stopPolling();
        setError('Lost connection while verifying. Please try again.');
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setVerifying(false);
  }

  const stub  = recipe?.contentStub;
  const steps = recipe?.activitySteps ?? [];

  return (
    <div>
      <h2>Your activity</h2>

      {stub?.summaryText && <p style={{ lineHeight: 1.7 }}>{stub.summaryText}</p>}

      {!!stub?.resourceLinks?.length && (
        <ul className="resource-links">
          {stub.resourceLinks.map(l => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
              {l.type && <span className="tag">{l.type}</span>}
            </li>
          ))}
        </ul>
      )}

      <ol className="steps">
        {steps.map(s => (
          <li key={s.stepNumber}>{s.description}</li>
        ))}
      </ol>

      {error && <div className="notice error" role="alert">{error}</div>}

      {!confirming && !verifying && (
        <button className="primary" onClick={() => setConfirming(true)}>
          I have completed the activity
        </button>
      )}

      {confirming && (
        <div className="notice">
          <p>Have you finished all of the steps above?</p>
          <button className="primary" onClick={startVerification}>Yes, check my work</button>
          <button className="secondary" onClick={() => setConfirming(false)}>Not yet</button>
        </div>
      )}

      {verifying && (
        <p className="muted" role="status">Checking your work — this usually takes a few seconds…</p>
      )}
    </div>
  );
}
