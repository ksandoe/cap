/**
 * ActivityPhase.tsx — Phase 2: the learning activity, one wizard screen
 * per module step.
 *
 * Each step renders its content blocks in order (see blocks.tsx):
 *   rich text (sanitized HTML), guided tool (instructions with per-student
 *   {param} substitution, lightweight branches, progress bar, app frame),
 *   knowledge check (formative, unrecorded), checklist (self-verification).
 *
 * On the final step, "I have completed the activity" → confirmation →
 * POST verify-sap → poll verify-status every 3s → advance on SAP_VERIFIED.
 *
 * TODO (Phase 2): gate enforcement per step, persisted completion state.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useSessionStore } from '../../store/sessionStore';
import { BlockView, postProgress } from './blocks';

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS  = 60_000; // client-side ceiling; SAP query itself times out server-side

export function ActivityPhase() {
  const sessionId    = useSessionStore(s => s.sessionId);
  const recipe       = useSessionStore(s => s.recipe);
  const activityStep = useSessionStore(s => s.activityStep);
  const setStep      = useSessionStore(s => s.setActivityStep);
  const setPhase     = useSessionStore(s => s.setPhase);

  const [confirming, setConfirming] = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const steps = recipe?.steps ?? [];
  const step  = steps[activityStep];
  const isLast = activityStep === steps.length - 1;

  function goTo(i: number) {
    setStep(i);
    postProgress(i);
  }

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
        } else if ((status === 'LEARNING' || status === 'ACTIVITY') && sapVerificationError) {
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

  if (!step) {
    return <p className="muted">This module has no activity steps yet.</p>;
  }

  return (
    <div>
      <h2>{step.title}</h2>
      {step.description && <p className="muted" style={{ marginTop: 0 }}>{step.description}</p>}

      {step.blocks.map(b => <BlockView key={b.blockId} block={b} />)}

      {error && <div className="notice error" role="alert">{error}</div>}

      {confirming && (
        <div className="notice">
          <p>Have you finished all of the steps in this module?</p>
          <button className="primary" onClick={startVerification}>Yes, check my work</button>
          <button className="secondary" onClick={() => setConfirming(false)}>Not yet</button>
        </div>
      )}

      {verifying && (
        <p className="muted" role="status">Checking your work — this usually takes a few seconds…</p>
      )}

      <div className="step-nav">
        <button className="secondary" disabled={activityStep === 0}
          onClick={() => goTo(activityStep - 1)}>
          ← Back
        </button>
        {!isLast && (
          <button className="primary" onClick={() => goTo(activityStep + 1)}>
            Next: {steps[activityStep + 1].title} →
          </button>
        )}
        {isLast && !confirming && !verifying && (
          <button className="primary" onClick={() => setConfirming(true)}>
            I have completed the activity
          </button>
        )}
      </div>
    </div>
  );
}
