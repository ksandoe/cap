/**
 * LoginPage.tsx
 *
 * Admin App login — v3 interim: a single shared team passkey grants full
 * access to every section. The optional name is stored for attribution
 * on drafts and validation notes.
 *
 * Long-term (planned): OTP sign-on — institutional email → one-time code —
 * with per-user accounts and role-based access managed by a superadmin.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { API_BASE } from '../services/api';
import { APP_VERSION } from '@cap/shared';

export function LoginPage() {
  const [passkey, setPasskey] = useState('');
  const [name, setName]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth  = useAuthStore(s => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const resp = await fetch(`${API_BASE}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkey, name: name.trim() || undefined }),
      });
      if (!resp.ok) throw new Error('Incorrect passkey.');
      const { token, role, name: who } = await resp.json();
      setAuth(token, role, who);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f8f8f7' }}>
      <div style={{ background: '#fff', padding: 40, borderRadius: 8,
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)', width: 360 }}>
        <h1 style={{ color: '#1e6b34', fontSize: 22, marginBottom: 8 }}>
          CAP Admin <span style={{ fontSize: 12, fontWeight: 400, color: '#999' }}>v{APP_VERSION}</span>
        </h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
          Enter the team passkey to manage modules, recipes, and results.
        </p>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: 13, color: '#444', marginBottom: 4 }}>
            Your name or initials <span style={{ color: '#999' }}>(optional — used to credit your edits)</span>
          </label>
          <input value={name} onChange={e => setName(e.target.value)}
            type="text" placeholder="e.g. Parand"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd',
              borderRadius: 4, fontSize: 14, marginBottom: 16 }} />
          <label style={{ display: 'block', fontSize: 13, color: '#444', marginBottom: 4 }}>
            Team passkey
          </label>
          <input value={passkey} onChange={e => setPasskey(e.target.value)}
            type="password" required autoFocus
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd',
              borderRadius: 4, fontSize: 14, marginBottom: 24 }} />
          {error && <p style={{ color: '#8B2500', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '10px 0', background: '#1e6b34',
              color: '#fff', border: 'none', borderRadius: 4, fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
