/**
 * AppShell.tsx — Shared Admin App chrome.
 * Top nav with per-section dropdown menus + main content area. The menus
 * read the same SECTIONS list as the dashboard tiles, so tile contents and
 * nav destinations always match. TODO: replace inline styles with CSS
 * modules or Tailwind.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore, AdminRole } from '../../store/authStore';
import { SECTIONS, Section } from '../../config/sections';
import { SoonTag } from '../PlannedPage';
import { APP_VERSION } from '@cap/shared';

// Which sections each role sees in the nav. The shared 'admin' passkey
// role sees everything; legacy single-role accounts keep their own section.
const NAV_SECTIONS: Record<AdminRole, string[]> = {
  author:     ['Authoring'],
  instructor: ['Instructor'],
  researcher: ['Researcher'],
  admin:      ['Authoring', 'Instructor', 'Researcher', 'Administration'],
};

function NavMenu({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const firstLive = section.links.find(l => !l.soon) ?? section.links[0];
  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button onClick={() => firstLive && navigate(firstLive.to)}
        style={{ background: 'none', border: 'none', color: '#fff',
          fontSize: 14, cursor: 'pointer', padding: '4px 0' }}>
        {section.title} ▾
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: 240,
          background: '#fff', border: '1px solid #ddd', borderRadius: 6,
          boxShadow: '0 8px 20px rgba(0,0,0,0.15)', padding: 6, zIndex: 60 }}>
          {section.links.map(l => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)}
              style={{ display: 'block', padding: '7px 10px', borderRadius: 4,
                color: l.soon ? '#999' : '#1e6b34', fontSize: 13,
                textDecoration: 'none' }}>
              {l.label}
              {l.soon && <SoonTag />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props { children: React.ReactNode; }

export function AppShell({ children }: Props) {
  const { role, displayName, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    clearAuth();
    navigate('/login');
  }

  const sections = role
    ? SECTIONS.filter(s => NAV_SECTIONS[role].includes(s.title))
    : [];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav style={{
        background: '#1e6b34', color: '#fff', padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: 24, height: 52,
      }}>
        <span style={{ fontWeight: 700, fontSize: 16, marginRight: 16 }}>
          CAP Admin <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.7 }}>v{APP_VERSION}</span>
        </span>
        <Link to="/" style={{ color: '#fff', textDecoration: 'none', fontSize: 14 }}>
          Home
        </Link>
        {sections.map(s => <NavMenu key={s.title} section={s} />)}
        <span style={{ marginLeft: 'auto', fontSize: 13, opacity: 0.8 }}>{displayName}</span>
        <button onClick={handleLogout}
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)',
            color: '#fff', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}>
          Sign out
        </button>
      </nav>
      <main style={{ flex: 1, padding: 32, maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {children}
      </main>
    </div>
  );
}
