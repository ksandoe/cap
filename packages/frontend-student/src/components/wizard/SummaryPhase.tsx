/**
 * SummaryPhase.tsx — Phase 4: outcome summary.
 *
 * Students see only the verdict — "Well done!" (passed) or "Not quite
 * yet" — plus the evaluative narrative and remediation options. The
 * rubric scores, per-dimension ratings, and outcome statuses are stored
 * de-identified for research and threshold tuning; they are never
 * rendered to the student.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, decodeSessionToken } from '../../services/api';
import { useSessionStore } from '../../store/sessionStore';

export function SummaryPhase() {
  const sessionId    = useSessionStore(s => s.sessionId);
  const evaluation   = useSessionStore(s => s.evaluation);
  const attemptNumber = useSessionStore(s => s.attemptNumber);
  const setSession   = useSessionStore(s => s.setSession);
  const setPhase     = useSessionStore(s => s.setPhase);
  const setAttempt   = useSessionStore(s => s.setAttemptNumber);

  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const navigate = useNavigate();

  if (!evaluation) {
    return <p className="muted">Your evaluation is not available.</p>;
  }

  const passed = !!evaluation.badgeAwarded;

  async function retry(toPhase: 2 | 3) {
    if (!sessionId || retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const { sessionToken, redirectPhase } = await api.session.retry(sessionId, toPhase);
      const claims = decodeSessionToken(sessionToken);
      // Keep the transcript for context but start the new conversation fresh
      useSessionStore.setState({ transcript: [], evaluation: null, activityStep: 0 });
      setSession({
        token:        sessionToken,
        sessionId:    claims.sessionId,
        moduleId:     claims.moduleId,
        currentPhase: redirectPhase,
      });
      setAttempt(attemptNumber + 1);
      setPhase(redirectPhase);
    } catch (e: any) {
      setRetryError(
        'A retry could not be started. If you have used all your attempts, ' +
        'please contact your instructor.'
      );
      setRetrying(false);
    }
  }

  return (
    <div>
      <h2>{passed ? 'Well done!' : 'Not quite yet'}</h2>

      {passed ? (
        <div className="notice success" role="status">
          <strong>You passed.</strong> Your badge has been issued; in a live
          course you would receive a Credly notification by email.
        </div>
      ) : (
        <div className="notice warning" role="status">
          <strong>Not passed this time.</strong> Your conversation didn’t yet
          show enough of what the module was trying to teach — see the
          summary below for where to focus, then try again.
        </div>
      )}

      <h3>Summary</h3>
      <p style={{ lineHeight: 1.7 }}>{evaluation.overallSummary}</p>

      <div className="actions">
        {!passed && (
          <>
            <button className="primary" onClick={() => retry(3)} disabled={retrying}>
              {retrying ? 'Starting…' : `Try the reflection again (attempt ${attemptNumber + 1})`}
            </button>
            <button className="secondary" onClick={() => retry(2)} disabled={retrying}>
              Revisit the activity
            </button>
          </>
        )}
        <button className="secondary" onClick={() => navigate('/')}>
          Return to course
        </button>
      </div>

      {retryError && <div className="notice error" role="alert">{retryError}</div>}

      {!passed && (
        <p className="muted" style={{ marginTop: 12 }}>
          “Try the reflection again” starts a new conversation — you won’t
          repeat the check-in or the activity. “Revisit the activity” takes
          you back through the module steps with a fresh exercise.
        </p>
      )}
    </div>
  );
}
