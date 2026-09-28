/**
 * LaunchPage.tsx
 *
 * Receives the session token and initial phase from the LTI redirect URL.
 * Decodes the token for session context, stores it in memory (Zustand),
 * and navigates to the wizard.
 *
 * URL shape: /launch?token=<jwt>&phase=<1-4>&key=<sessionKey>&persona=<key>
 *
 * &key= is the opaque session key CAP "returns to Canvas" — in production
 * it is written to a grade column invisible to the student, and the
 * platform sends it back on relaunch. In the dev flow the launchpad plays
 * Canvas: this page deposits the key into the launchpad's localStorage
 * slot (cap-canvas-key:{persona}:{moduleId}), which the launchpad reads
 * when building its launch links.
 */
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSessionStore } from '../store/sessionStore';
import { decodeSessionToken } from '../services/api';

export function LaunchPage() {
  const [params]     = useSearchParams();
  const navigate     = useNavigate();
  const setSession   = useSessionStore(s => s.setSession);

  const token = params.get('token');
  const phase = parseInt(params.get('phase') ?? '1', 10);

  useEffect(() => {
    if (!token) { navigate('/error?code=NO_TOKEN'); return; }
    try {
      const claims  = decodeSessionToken(token);
      const key     = params.get('key');
      const persona = params.get('persona');
      // Deposit the resume key where "Canvas" keeps it — the launchpad's
      // localStorage stands in for the hidden grade column.
      if (key && persona) {
        try {
          localStorage.setItem(`cap-canvas-key:${persona}:${claims.moduleId}`, key);
        } catch { /* private browsing — key simply won't persist */ }
      }
      setSession({
        token,
        sessionId:    claims.sessionId,
        moduleId:     claims.moduleId,
        currentPhase: claims.currentPhase ?? phase,
        instructorPreview: params.get('instructor') === '1',
      });
      navigate('/wizard', { replace: true });
    } catch {
      navigate('/error?code=INVALID_TOKEN');
    }
  }, []);

  return (
    <div style={{ padding: 48, maxWidth: 520, margin: '0 auto' }}>
      <p>{phase > 1 ? 'Resuming your session…' : 'Launching your activity…'}</p>
    </div>
  );
}
