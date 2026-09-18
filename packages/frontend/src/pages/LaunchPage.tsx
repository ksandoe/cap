/**
 * LaunchPage.tsx
 *
 * Receives the session token and initial phase from the LTI redirect URL.
 * Stores the token in memory (Zustand store) and navigates to the wizard.
 *
 * URL shape: /launch?token=<jwt>&phase=<1-4>
 */
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSessionStore } from '../store/sessionStore';

export function LaunchPage() {
  const [params]     = useSearchParams();
  const navigate     = useNavigate();
  const setSession   = useSessionStore(s => s.setSession);

  useEffect(() => {
    const token = params.get('token');
    const phase = parseInt(params.get('phase') ?? '1', 10);
    if (!token) { navigate('/error?code=NO_TOKEN'); return; }
    setSession({ token, currentPhase: phase });
    navigate('/wizard', { replace: true });
  }, []);

  return <div style={{ padding: 32 }}>Launching your activity…</div>;
}
