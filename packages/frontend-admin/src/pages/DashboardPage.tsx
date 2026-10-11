/**
 * DashboardPage.tsx — Unified admin landing page.
 *
 * One login, one page: four sections (authoring, instructor, researcher,
 * administration) with links into each area's pages. Section definitions
 * live in config/sections.ts — the top-nav dropdowns read the same list,
 * so tiles and menus always match. `soon` links render a "not yet built"
 * tag so the menu doesn't over-promise.
 */
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { SECTIONS } from '../config/sections';
import { SoonTag } from '../components/PlannedPage';

export function DashboardPage() {
  return (
    <AppShell>
      <h2 style={{ color: '#1e6b34', marginBottom: 4 }}>CAP Admin</h2>
      <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
        One login, all areas — pick a section below.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {SECTIONS.map(s => (
          <div key={s.title} style={{ border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ background: '#E9F5EC', padding: '12px 16px',
              fontWeight: 600, fontSize: 14, color: '#1e6b34' }}>
              {s.title}
            </div>
            <div style={{ padding: 16 }}>
              <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, marginTop: 0 }}>
                {s.blurb}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {s.links.map(l => (
                  <Link key={l.to} to={l.to}
                    style={{ color: l.soon ? '#999' : '#1e6b34', fontSize: 14, textDecoration: 'none' }}>
                    {l.label} →
                    {l.soon && <SoonTag />}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
