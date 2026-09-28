/**
 * SummaryPhase.tsx — Phase 4: outcome summary.
 *
 * Students see only the verdict — "Well done!" (passed) or "Not quite
 * yet" — plus the evaluative narrative and remediation options. The
 * rubric scores, per-dimension ratings, and outcome statuses are stored
 * de-identified for research and threshold tuning; they are never
 * rendered to the student.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, decodeSessionToken } from '../../services/api';
import { useSessionStore } from '../../store/sessionStore';
import type { Evaluation } from '@cap/shared';

// The dev launchpad's localStorage slot stands in for the hidden Canvas
// grade column. When a session completes its record is destroyed — the
// key is dead, so clear the slot (in production the tool would overwrite
// the column when posting the final grade). A retry issues a fresh key,
// which is written back to the same slot.
function canvasKeySlot(persona: string | null, moduleId: string | null) {
  return persona && moduleId ? `cap-canvas-key:${persona}:${moduleId}` : null;
}

export function SummaryPhase() {
  const sessionId    = useSessionStore(s => s.sessionId);
  const evaluation   = useSessionStore(s => s.evaluation);
  const instructorPreview = useSessionStore(s => s.instructorPreview);
  const attemptNumber = useSessionStore(s => s.attemptNumber);
  const setSession   = useSessionStore(s => s.setSession);
  const setPhase     = useSessionStore(s => s.setPhase);
  const setAttempt   = useSessionStore(s => s.setAttemptNumber);

  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const navigate = useNavigate();
  const moduleId = useSessionStore(s => s.moduleId);
  const persona  = useSessionStore(s => s.persona);

  // Reaching the summary means the session record was completed and
  // destroyed — consume the resume key so the launchpad stops offering
  // "resume" for a session that no longer exists.
  useEffect(() => {
    const slot = canvasKeySlot(persona, moduleId);
    if (evaluation && slot) {
      try { localStorage.removeItem(slot); } catch { /* non-fatal */ }
    }
  }, [evaluation, persona, moduleId]);

  if (!evaluation) {
    return <p className="muted">Your evaluation is not available.</p>;
  }

  const passed = !!evaluation.badgeAwarded;

  async function retry(toPhase: 2 | 3) {
    if (!sessionId || retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const { sessionToken, redirectPhase, sessionKey } = await api.session.retry(sessionId, toPhase);
      const claims = decodeSessionToken(sessionToken);
      // The retry is a new session with a fresh key — update the "grade
      // column" so the launchpad's resume link points at the live session.
      const slot = canvasKeySlot(persona, moduleId);
      if (slot && sessionKey) {
        try { localStorage.setItem(slot, sessionKey); } catch { /* non-fatal */ }
      }
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

      {instructorPreview && <InstructorPreview evaluation={evaluation} />}
    </div>
  );
}

/** Testing aid — rendered only when the launchpad launched with
 *  ?instructor=1. Students see only the section above; this panel is
 *  how instructors inspect the rubric detail during trials without
 *  changing the real student experience. */
function InstructorPreview({ evaluation }: { evaluation: Evaluation }) {
  const dims = evaluation.dimensionRatings ?? [];
  return (
    <section style={{
      marginTop: 32, padding: '16px 20px', borderRadius: 8,
      border: '2px dashed #b8860b', background: '#fffdf2',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1,
                    color: '#8a6400', textTransform: 'uppercase', marginBottom: 4 }}>
        Instructor preview — not shown to students
      </div>
      <p style={{ fontSize: 13, color: '#6b5308', marginTop: 0 }}>
        Everything below this banner is rubric detail kept behind the scenes:
        stored de-identified for research and threshold tuning.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#555' }}>
            <th style={{ padding: '4px 8px 4px 0' }}>Dimension</th>
            <th style={{ padding: '4px 8px' }}>Rating</th>
            <th style={{ padding: '4px 8px' }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {dims.map((d: any, i: number) => (
            <tr key={i} style={{ borderTop: '1px solid #e8ddb0' }}>
              <td style={{ padding: '6px 8px 6px 0' }}>
                <div style={{ fontWeight: 600 }}>{d.dimensionName ?? d.dimension ?? d.name ?? `Dimension ${i + 1}`}</div>
                {d.narrative && <div style={{ color: '#666', fontSize: 12 }}>{d.narrative}</div>}
              </td>
              <td style={{ padding: '6px 8px' }}>{d.rating ?? '—'}</td>
              <td style={{ padding: '6px 8px', fontWeight: 700 }}>{d.score ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 12, fontSize: 14 }}>
        <strong>Overall score: {evaluation.overallScore ?? '—'}</strong>
        {' · '}Outcome: {evaluation.badgeAwarded ? 'pass (badge awarded)' : 'no pass'}
      </div>

      {(evaluation.outcomeSummary?.length ?? 0) > 0 && (
        <ul style={{ fontSize: 13, color: '#555', marginBottom: 0 }}>
          {evaluation.outcomeSummary!.map((o: any, i: number) => (
            <li key={i}>{typeof o === 'string' ? o : `${o.outcome ?? o.name ?? ''}: ${o.status ?? o.rating ?? ''}`}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
