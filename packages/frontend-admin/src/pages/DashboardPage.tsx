/**
 * DashboardPage.tsx — Unified admin landing page.
 *
 * One login, one page: four sections (authoring, instructor, researcher,
 * administration) with links into each area's pages. Role-based menu
 * restrictions can be layered on later by graying out sections.
 */
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';

const SECTIONS: {
  title: string; blurb: string;
  links: { label: string; to: string }[];
}[] = [
  {
    title: 'Authoring',
    blurb: 'Create and revise instructional recipes — outcomes, steps, content blocks, rubric, and probing behavior.',
    links: [
      { label: 'Recipes',       to: '/author/recipes' },
      { label: 'New recipe',    to: '/author/recipes/new' },
    ],
  },
  {
    title: 'Instructor',
    blurb: 'Monitor module activity, review session transcripts and evaluations, manage retries.',
    links: [
      { label: 'Modules',         to: '/instructor/modules' },
      { label: 'Validation log',  to: '/instructor/validation' },
    ],
  },
  {
    title: 'Researcher',
    blurb: 'De-identified session data for approved research. Consent and IRB-gated exports.',
    links: [
      { label: 'Data browser', to: '/researcher/data' },
      { label: 'Export',       to: '/researcher/export' },
      { label: 'Consent',      to: '/researcher/consent' },
    ],
  },
  {
    title: 'Administration',
    blurb: 'Module configuration, SAP account pool, integration health, audit log, and IRB controls.',
    links: [
      { label: 'Module config', to: '/admin/modules' },
      { label: 'SAP pool',      to: '/admin/sap-pool' },
      { label: 'Audit log',     to: '/admin/audit-log' },
      { label: 'Health',        to: '/admin/health' },
      { label: 'IRB',           to: '/admin/irb' },
    ],
  },
];

export function DashboardPage() {
  return (
    <AppShell>
      <h2 style={{ color: '#1D4E8C', marginBottom: 4 }}>CAP Admin</h2>
      <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
        One login, all areas — pick a section below.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {SECTIONS.map(s => (
          <div key={s.title} style={{ border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ background: '#EEF3FA', padding: '12px 16px',
              fontWeight: 600, fontSize: 14, color: '#1D4E8C' }}>
              {s.title}
            </div>
            <div style={{ padding: 16 }}>
              <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, marginTop: 0 }}>
                {s.blurb}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {s.links.map(l => (
                  <Link key={l.to} to={l.to}
                    style={{ color: '#1D4E8C', fontSize: 14, textDecoration: 'none' }}>
                    {l.label} →
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
