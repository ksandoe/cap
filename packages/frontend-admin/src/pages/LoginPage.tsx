/**
 * LoginPage.tsx
 *
 * Admin App login. In production this will redirect to institutional
 * SSO (SAML/OIDC). For the PoC it accepts email + password and calls
 * the backend /admin/auth/login endpoint which returns a JWT and role.
 *
 * TODO: replace with SSO redirect when institutional IdP is configured.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { API_BASE } from '../services/api';

const ROLE_HOME: Record<string, string> = {
  author:     '/author/recipes',
  instructor: '/instructor/modules',
  researcher: '/researcher/data',
  admin:      '/admin/modules',
};

export function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const setAuth  = useAuthStore(s => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const resp = await fetch(`${API_BASE}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) throw new Error('Invalid credentials.');
      const { token, role } = await resp.json();
      setAuth(token, role, email);
      navigate(ROLE_HOME[role] ?? '/');
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
        <h1 style={{ color: '#1D4E8C', fontSize: 22, marginBottom: 8 }}>CAP Admin</h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
          Sign in to manage modules, recipes, and results.
        </p>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: 13, color: '#444', marginBottom: 4 }}>
            Email
          </label>
          <input value={email} onChange={e => setEmail(e.target.value)}
            type="email" required
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd',
              borderRadius: 4, fontSize: 14, marginBottom: 16 }} />
          <label style={{ display: 'block', fontSize: 13, color: '#444', marginBottom: 4 }}>
            Password
          </label>
          <input value={password} onChange={e => setPassword(e.target.value)}
            type="password" required
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd',
              borderRadius: 4, fontSize: 14, marginBottom: 24 }} />
          {error && <p style={{ color: '#8B2500', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '10px 0', background: '#1D4E8C',
              color: '#fff', border: 'none', borderRadius: 4, fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p style={{ color: '#aaa', fontSize: 12, marginTop: 16, textAlign: 'center' }}>
          TODO: replace with institutional SSO
        </p>
      </div>
    </div>
  );
}
