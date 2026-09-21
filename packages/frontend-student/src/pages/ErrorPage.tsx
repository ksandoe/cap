import { useSearchParams } from 'react-router-dom';

const ERROR_MESSAGES: Record<string, string> = {
  NO_TOKEN:          'Your session could not be started. Please relaunch from Canvas.',
  INVALID_TOKEN:     'Your session has expired. Please relaunch from Canvas.',
  SAP_POOL_EXHAUSTED:'All practice accounts are currently in use. Please try again in a few minutes.',
  SESSION_NOT_FOUND: 'Your session was not found. Please relaunch from Canvas.',
};

export function ErrorPage() {
  const [params] = useSearchParams();
  const code     = params.get('code') ?? 'UNKNOWN';
  const message  = ERROR_MESSAGES[code] ?? 'An unexpected error occurred. Please relaunch from Canvas.';
  return (
    <div style={{ padding: 48, maxWidth: 520, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#1D4E8C' }}>Something went wrong</h2>
      <p style={{ color: '#444', lineHeight: 1.6 }}>{message}</p>
      <p style={{ color: '#888', fontSize: 13 }}>Error code: {code}</p>
    </div>
  );
}
