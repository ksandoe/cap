/**
 * ExitPage.tsx — Where a student lands when they leave the activity.
 *
 * The activity opens in its own browser tab from Canvas, so "leaving" means
 * going back to Canvas, not to anywhere inside this app. The page says what
 * happened, what to do next, and offers to close the tab.
 *
 * Reached from Save & exit, the Summary's "Return to course" button, and an
 * expired session. Sessions started from the developer launchpad also get a
 * link back to it, so the demo workflow still works.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSessionStore } from '../store/sessionStore';

export type ExitReason = 'saved' | 'finished' | 'expired';

export interface ExitState {
  reason?: ExitReason;
  /** Days the saved session can be resumed, for the "saved" reason. */
  days?: number;
  /** True when the session came from the developer launchpad. */
  dev?: boolean;
}

const COPY: Record<ExitReason, { title: string; body: (days?: number) => string }> = {
  saved: {
    title: 'Your progress is saved',
    body: days =>
      'Close this tab and go back to Canvas. When you are ready to continue, open the activity link again '
      + `and you will pick up where you left off${days ? ` (within ${days} days)` : ''}.`,
  },
  finished: {
    title: 'You have finished this activity',
    body: () => 'Close this tab to go back to your course.',
  },
  expired: {
    title: 'Your session has ended',
    body: () => 'Close this tab, then open the activity link in Canvas again to start a new session.',
  },
};

export function ExitPage() {
  const state  = (useLocation().state as ExitState | null) ?? {};
  const reason: ExitReason = state.reason && COPY[state.reason] ? state.reason : 'finished';
  const copy   = COPY[reason];
  const [closeFailed, setCloseFailed] = useState(false);

  // Drop the session token and everything loaded for it. This happens here, after the
  // wizard has unmounted: clearing it first would trip the wizard's "no session" check
  // and send the student to the error page instead.
  const reset = useSessionStore(s => s.reset);
  useEffect(() => { reset(); }, [reset]);

  // Browsers only let a script close a tab it opened, so this may do nothing.
  // If the tab is still here a moment later, say so instead of seeming broken.
  function closeTab() {
    window.close();
    setTimeout(() => setCloseFailed(true), 300);
  }

  return (
    <div style={{ padding: 48, maxWidth: 520, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#1D4E8C' }}>{copy.title}</h2>
      <p style={{ color: '#444', lineHeight: 1.6 }}>{copy.body(state.days)}</p>
      <button onClick={closeTab}
        style={{ background: '#1D4E8C', color: '#fff', border: 'none', borderRadius: 4,
          padding: '8px 18px', cursor: 'pointer', fontSize: 14 }}>
        Close this tab
      </button>
      {closeFailed && (
        <p role="status" style={{ color: '#666', fontSize: 14, marginTop: 14 }}>
          Your browser did not let this page close itself. Please close the tab yourself.
        </p>
      )}
      {state.dev && (
        <p style={{ marginTop: 32, fontSize: 13 }}>
          <Link to="/">Back to the developer launchpad</Link>
        </p>
      )}
    </div>
  );
}
