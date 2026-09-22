/**
 * SummaryPhase.tsx — Phase 4: summary evaluation.
 *
 * Shows the rubric-based evaluation: per-dimension ratings with
 * narratives, per-outcome status, and an overall summary. Offers a
 * retry when any dimension is rated "Needs further work", a print
 * view, and a JSON export of the session data.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, decodeSessionToken } from '../../services/api';
import { useSessionStore } from '../../store/sessionStore';
import { RatingLevel } from '@cap/shared';

const RATING_STYLE: Record<RatingLevel, { bg: string; fg: string }> = {
  'Strong':             { bg: '#e2f0e4', fg: '#1e6b34' },
  'Developing':         { bg: '#fdf3d8', fg: '#8a6d00' },
  'Needs further work': { bg: '#fbe3e3', fg: '#9c2323' },
};

export function SummaryPhase() {
  const sessionId    = useSessionStore(s => s.sessionId);
  const evaluation   = useSessionStore(s => s.evaluation);
  const transcript   = useSessionStore(s => s.transcript);
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

  const needsWork = evaluation.dimensionRatings.some(
    d => d.rating === 'Needs further work'
  );

  async function retry() {
    if (!sessionId || retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const { sessionToken, redirectPhase } = await api.session.retry(sessionId);
      const claims = decodeSessionToken(sessionToken);
      // Keep the transcript for context but start the new conversation fresh
      useSessionStore.setState({ transcript: [], evaluation: null });
      setSession({
        token:        sessionToken,
        sessionId:    claims.sessionId,
        moduleId:     claims.moduleId,
        currentPhase: redirectPhase,
      });
      setAttempt(attemptNumber + 1);
      setPhase(3);
    } catch (e: any) {
      setRetryError(
        'A retry could not be started. If you have used all your attempts, ' +
        'please contact your instructor.'
      );
      setRetrying(false);
    }
  }

  function exportJson() {
    const data = {
      sessionId,
      exportedAt: new Date().toISOString(),
      transcript: transcript.map(({ role, content }) => ({ role, content })),
      evaluation,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `cap-session-${sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h2>Your evaluation</h2>

      {evaluation.badgeAwarded ? (
        <div className="notice success" role="status">
          <strong>You passed — badge awarded.</strong> Your badge has been issued;
          in a live course you would receive a Credly notification by email.
        </div>
      ) : (
        <div className="notice warning" role="status">
          <strong>Not passed this time.</strong> A passing evaluation requires no
          dimension rated “Needs further work” and earns the module badge.
          {needsWork
            ? ' Review the dimensions below — you can retry the conversation focusing on the areas marked “Needs further work”.'
            : ' Review the evaluation below; you may retry the conversation to strengthen your responses.'}
        </div>
      )}

      <div className="dimensions">
        {evaluation.dimensionRatings.map(d => {
          const style = RATING_STYLE[d.rating as RatingLevel] ?? RATING_STYLE['Developing'];
          return (
            <div key={d.dimensionName} className="dimension">
              <div className="dimension-head">
                <strong>{d.dimensionName}</strong>
                <span className="rating" style={{ background: style.bg, color: style.fg }}>
                  {d.rating}
                </span>
              </div>
              <p>{d.narrative}</p>
            </div>
          );
        })}
      </div>

      {!!evaluation.outcomeSummary?.length && (
        <>
          <h3>Learning outcomes</h3>
          <ul className="outcomes">
            {evaluation.outcomeSummary.map(o => (
              <li key={o.outcomeIndex}>
                <span className={`outcome-status ${o.status}`}>
                  {o.status === 'achieved' ? 'Achieved'
                    : o.status === 'partial' ? 'Partially addressed' : 'Not addressed'}
                </span>
                {o.outcomeText}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Overall</h3>
      <p style={{ lineHeight: 1.7 }}>{evaluation.overallSummary}</p>

      <div className="actions">
        {!evaluation.badgeAwarded && (
          <button className="primary" onClick={retry} disabled={retrying}>
            {retrying ? 'Starting…' : `Retry the conversation (attempt ${attemptNumber + 1})`}
          </button>
        )}
        <button className="secondary" onClick={() => window.print()}>
          Print summary
        </button>
        <button className="secondary" onClick={exportJson}>
          Download session data (JSON)
        </button>
        <button className="secondary" onClick={() => navigate('/')}>
          Return to course
        </button>
      </div>

      {retryError && <div className="notice error" role="alert">{retryError}</div>}

      {needsWork && (
        <p className="muted" style={{ marginTop: 12 }}>
          A retry focuses on the areas marked “Needs further work” — you won’t
          repeat the check-in or the activity.
        </p>
      )}
    </div>
  );
}
