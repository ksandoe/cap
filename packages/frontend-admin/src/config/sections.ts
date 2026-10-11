/**
 * sections.ts — Single source of truth for admin-app sections + their links.
 *
 * Used by the dashboard tiles and the top-nav dropdowns so the two never
 * drift apart. `soon` marks links whose pages exist only as honest stubs
 * (PlannedPage / preview mocks) — shown tagged "not yet built" in both places.
 */
export interface SectionLink { label: string; to: string; soon?: boolean }
export interface Section {
  title: string;
  blurb: string;
  links: SectionLink[];
}

export const SECTIONS: Section[] = [
  {
    title: 'Authoring',
    blurb: 'Guided module authoring — draft modules with AI assistance across multiple sessions, then publish.',
    links: [
      { label: 'Modules',                  to: '/author/recipes'  },
      { label: 'New module — AI-assisted', to: '/author/generate' },
    ],
  },
  {
    title: 'Instructor',
    blurb: 'Monitor module activity, review session transcripts and evaluations, manage retries.',
    links: [
      { label: 'Passing thresholds', to: '/instructor/thresholds' },
      { label: 'Evaluation records', to: '/instructor/evaluations' },
      { label: 'Modules',            to: '/instructor/modules',    soon: true },
      { label: 'Validation log',     to: '/instructor/validation', soon: true },
    ],
  },
  {
    title: 'Researcher',
    blurb: 'De-identified session data for approved research. Consent and IRB-gated exports.',
    links: [
      { label: 'Data browser',  to: '/researcher/data',    soon: true },
      { label: 'Export',        to: '/researcher/export',  soon: true },
      { label: 'Consent',       to: '/researcher/consent', soon: true },
      { label: 'IRB approval',  to: '/researcher/irb',     soon: true },
    ],
  },
  {
    title: 'Administration',
    blurb: 'Platform settings, module configuration, SAP account pool, integration health, and audit log.',
    links: [
      { label: 'Platform settings — rubric & passkey', to: '/admin/platform' },
      { label: 'Health',        to: '/admin/health' },
      { label: 'Module config', to: '/admin/modules',   soon: true },
      { label: 'SAP pool',      to: '/admin/sap-pool',  soon: true },
      { label: 'Audit log',     to: '/admin/audit-log', soon: true },
    ],
  },
];
