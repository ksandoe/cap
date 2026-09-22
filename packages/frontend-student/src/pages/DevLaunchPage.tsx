/**
 * DevLaunchPage.tsx — Canvas launchpad (dev/demo entry point).
 *
 * In production, students arrive via a Canvas LTI 1.3 launch and never see
 * this page. While campus LTI registration is pending, this page simulates
 * the Canvas side of the flow: pick a persona (each maps to a stable
 * canvasUuid, so resume/retry behavior is demoable), pick a module, and
 * "launch" — the backend creates or resumes a session and redirects into
 * the student wizard exactly as a real LTI launch does.
 *
 * Available when the backend exposes /dev/* (local dev, or a demo build
 * with ENABLE_DEV_ROUTES=true).
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { API_BASE } from '../services/api';

interface Module { moduleId: string; moduleTitle: string }

const PERSONAS = [
  { key: 'alex',  label: 'Alex Rivera' },
  { key: 'blair', label: 'Blair Chen' },
  { key: 'casey', label: 'Casey Okafor' },
];

export function DevLaunchPage() {
  const notice = (useLocation().state as any)?.notice as string | undefined;
  const [persona,  setPersona]  = useState(PERSONAS[0].key);
  const [modules,  setModules]  = useState<Module[] | null>(null);
  const [loadErr,  setLoadErr]  = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/dev/modules`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setModules(d.modules))
      .catch(() => setLoadErr(true));
  }, []);

  return (
    <div style={{ padding: 48, maxWidth: 640, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <header style={{ borderBottom: '3px solid #1D4E8C', paddingBottom: 12, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: '#888', letterSpacing: 1, textTransform: 'uppercase' }}>
          Canvas course (simulated)
        </div>
        <h1 style={{ margin: '4px 0 0', color: '#1D4E8C', fontSize: 26 }}>
          BUS 340 — Business Process Management
        </h1>
      </header>

      {notice && (
        <p style={{ padding: '10px 14px', background: '#fdf3d7', border: '1px solid #e0c97f',
                    borderRadius: 6, fontSize: 13, color: '#6b5308', marginBottom: 20 }}>
          {notice}
        </p>
      )}

      <section style={{ marginBottom: 28 }}>
        <label htmlFor="persona" style={{ fontWeight: 600, fontSize: 14, color: '#333' }}>
          Signed in as
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {PERSONAS.map(p => (
            <button
              key={p.key}
              onClick={() => setPersona(p.key)}
              style={{
                padding: '8px 16px', borderRadius: 20, cursor: 'pointer',
                border: persona === p.key ? '2px solid #1D4E8C' : '1px solid #ccc',
                background: persona === p.key ? '#e8f0fa' : '#fff',
                fontWeight: persona === p.key ? 700 : 400,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 13, color: '#777', marginTop: 8 }}>
          Each persona has its own session — relaunching a module resumes
          where that persona left off.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 17, color: '#333' }}>Modules</h2>

        {loadErr && (
          <p style={{ color: '#a33' }}>
            Could not reach the backend. Is <code>npm run dev</code> running?
          </p>
        )}
        {modules?.length === 0 && (
          <p style={{ color: '#666' }}>No active modules found.</p>
        )}

        {(modules ?? []).map(m => (
          <div
            key={m.moduleId}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', border: '1px solid #ddd', borderRadius: 8,
              marginBottom: 10, background: '#fff',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{m.moduleTitle}</div>
              <div style={{ fontSize: 13, color: '#777' }}>
                Assignment · launches external tool
              </div>
            </div>
            <a
              href={`${API_BASE}/dev/launch?moduleId=${encodeURIComponent(m.moduleId)}&persona=${persona}`}
              style={{
                padding: '9px 18px', background: '#1D4E8C', color: '#fff',
                borderRadius: 6, textDecoration: 'none', fontWeight: 600,
                fontSize: 14, whiteSpace: 'nowrap',
              }}
            >
              Launch →
            </a>
          </div>
        ))}

        {modules === null && !loadErr && (
          <p style={{ color: '#888' }}>Loading modules…</p>
        )}
      </section>

      <p style={{ fontSize: 12, color: '#999', marginTop: 32 }}>
        Demo launchpad — replaces Canvas while LTI registration is pending.
        The launch itself exercises the real session pipeline.
      </p>
    </div>
  );
}
