/**
 * LaunchPage.tsx
 *
 * Receives the session token and initial phase from the LTI redirect URL.
 * Decodes the token for session context, stores it in memory (Zustand),
 * and navigates to the wizard.
 *
 * URL shape: /launch?token=<jwt>&phase=<1-4>
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
      const claims = decodeSessionToken(token);
      setSession({
        token,
        sessionId:    claims.sessionId,
        moduleId:     claims.moduleId,
        currentPhase: claims.currentPhase ?? phase,
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
