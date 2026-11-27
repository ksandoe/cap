/**
 * LandingPage.tsx — What a student sees when Canvas opens the activity inside its page.
 *
 * A Canvas assignment launches the tool in a frame on the assignment page, which is
 * too small to work in. This page lives in that frame: it says what the activity is,
 * where the student stands, and has a button that opens the activity in a new browser
 * tab with the whole window to use.
 *
 * Loaded as a whole window instead (the course navigation link, or an assignment set
 * to open in a new window) there is nothing to land on, so the page passes straight
 * through to the activity.
 *
 * URL shape: /landing?token=<jwt>&phase=<1-4>[&key=…&persona=…] — the same as /launch,
 * and passed on to it unchanged. Sign-in by session token in the address is the current
 * mechanism for both pages. A one-time code will replace it (work package 6, A3).
 *
 * Rules this page keeps:
 *   - No cookies and no browser storage shared with the new tab. Browsers isolate
 *     storage inside frames, so the two tabs meet only at the server: this page polls
 *     the status endpoint.
 *   - Polling never leaves the page. The status endpoint answers normally for a
 *     finished session, and a failure shows a small note and keeps the last status.
 *   - It does not know a result. "Completed" cannot be shown until completion is
 *     recorded per learner (work package 6, B3), so a finished session reads as ended.
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api, decodeSessionToken } from '../services/api';
import { useSessionStore } from '../store/sessionStore';

const POLL_MS = 8000;

const PHASE_LABEL: Record<number, string> = {
  1: 'check-in', 2: 'activity', 3: 'reflection conversation', 4: 'summary',
};

type Status = { status: 'not_started' | 'in_progress' | 'saved' | 'ended'; phaseReached?: number };

/** True when this page is inside another page's frame. Comparing the two window
 *  objects is allowed across origins; reading anything from the top window is not. */
function isFramed(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

export function LandingPage() {
  const { search } = useLocation();
  const [params] = useSearchParams();
  const token = params.get('token');

  if (!token) return <Navigate to="/error?code=NO_TOKEN" replace />;
  // Not in a frame: nothing to land on. Go straight to the activity, keeping the parameters.
  if (!isFramed()) return <Navigate to={`/launch${search}`} replace />;
  return <FramedLanding token={token} search={search} persona={params.get('persona')} />;
}

function FramedLanding({ token, search, persona }: { token: string; search: string; persona: string | null }) {
  const setSession = useSessionStore(s => s.setSession);
  const [moduleId, setModuleId]       = useState<string | null>(null);
  const [recipe, setRecipe]           = useState<{ moduleTitle?: string; moduleDescription?: string } | null>(null);
  const [status, setStatus]           = useState<Status | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [badToken, setBadToken]       = useState(false);
  const [opened, setOpened]           = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Hold the token in memory so the API client can send it. Nothing is stored.
  useEffect(() => {
    try {
      const claims = decodeSessionToken(token);
      setSession({ token, sessionId: claims.sessionId, moduleId: claims.moduleId,
        currentPhase: claims.currentPhase ?? 1, persona: persona ?? undefined });
      setModuleId(claims.moduleId);
    } catch { setBadToken(true); }
  }, [token]);

  useEffect(() => {
    if (!moduleId) return;
    api.recipe.get(moduleId).then(setRecipe).catch(() => setRecipe({}));
  }, [moduleId]);

  // Ask for the status now, every few seconds while the page is visible, and whenever
  // the student returns to this tab. The activity runs in another tab.
  useEffect(() => {
    if (!moduleId) return;
    let stopped = false;
    const refresh = () => {
      if (document.hidden) return;
      api.session.status()
        .then(s => { if (!stopped) { setStatus(s); setStatusFailed(false); } })
        .catch(() => { if (!stopped) setStatusFailed(true); });
    };
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [moduleId]);

  // Tell the host page how tall this page is, using the standard LTI message that
  // Canvas listens for. Measure the page's own container, not the document: a
  // document is never shorter than its frame, so the frame could never shrink.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const post = () => window.parent.postMessage(
      { subject: 'lti.frameResize', height: Math.ceil(el.getBoundingClientRect().height) }, '*');
    post();
    const observer = new ResizeObserver(post);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (badToken) return <Navigate to="/error?code=INVALID_TOKEN" replace />;

  const ended = status?.status === 'ended';
  const label = status?.status === 'in_progress' || status?.status === 'saved'
    ? 'Continue the activity'
    : status?.status === 'not_started' ? 'Start the activity' : 'Open the activity';

  return (
    <div ref={rootRef} style={{ padding: '24px 28px 28px', maxWidth: 680, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ marginTop: 0 }}>{recipe?.moduleTitle ?? 'Your activity'}</h2>
      {recipe?.moduleDescription && (
        <p style={{ color: '#444', lineHeight: 1.6 }}>{recipe.moduleDescription}</p>
      )}

      <ul style={{ color: '#555', lineHeight: 1.7, paddingLeft: 20 }}>
        <li>The activity opens in a new browser tab, so you have the whole window to work in.</li>
        <li>Your progress is saved as you go. If you stop, open this assignment in Canvas again to pick up where you left off.</li>
        <li>When you have finished, you can close the new tab.</li>
      </ul>

      <div role="status" aria-live="polite" className={ended ? 'notice warning' : 'notice'}>
        {status === null && 'Checking your progress…'}
        {status?.status === 'not_started' && 'You have not started yet.'}
        {status?.status === 'in_progress' &&
          `In progress: you are at the ${PHASE_LABEL[status.phaseReached ?? 1] ?? 'activity'} stage.`}
        {status?.status === 'saved' && 'Your progress is saved. You can continue where you left off.'}
        {ended && 'This session has ended. If you finished the activity, your work is recorded. To start again, open this assignment in Canvas again.'}
        {statusFailed && (
          <div className="muted" style={{ marginTop: 6 }}>Could not check your progress just now. This page will try again.</div>
        )}
      </div>

      {!ended && (
        <>
          <a className="primary" href={`/launch${search}`} target="_blank" rel="noopener noreferrer"
            onClick={() => setOpened(true)}
            style={{ display: 'inline-block', textDecoration: 'none' }}>
            {label}
          </a>
          {opened && (
            <p className="muted" style={{ marginTop: 12 }}>
              The activity should have opened in a new tab. This page updates by itself as you work.
              If nothing opened, check that your browser allows new tabs from this site.
            </p>
          )}
        </>
      )}
    </div>
  );
}
