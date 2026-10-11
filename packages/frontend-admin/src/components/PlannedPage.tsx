/**
 * PlannedPage.tsx — Honest placeholders for admin pages that aren't built yet.
 *
 * `PlannedPage` replaces a whole stub page; `PlannedBanner` sits at the top of
 * a page whose UI exists only as a mock preview (dead buttons, fake data).
 * Both say the same thing: this is planned, not implemented.
 */
import { ReactNode } from 'react';

/** Small "not yet built" chip — used wherever a link leads to a stub page. */
export function SoonTag() {
  return (
    <span style={{ marginLeft: 8, fontSize: 11, color: '#999',
      border: '1px solid #ddd', borderRadius: 8, padding: '1px 7px',
      whiteSpace: 'nowrap' }}>
      not yet built
    </span>
  );
}

export function PlannedBanner({ extra }: { extra?: string }) {
  return (
    <div style={{ background: '#FDF6E3', border: '1px solid #F0D9A0',
      borderRadius: 6, padding: '10px 14px', marginBottom: 20 }}>
      <strong style={{ color: '#854F0B', fontSize: 13 }}>Not yet built</strong>
      <p style={{ color: '#854F0B', fontSize: 13, margin: '4px 0 0' }}>
        This page is a planned part of the admin console — the layout below is a
        preview only and nothing here is wired to live data.{extra ? ` ${extra}` : ''}
      </p>
    </div>
  );
}

export function PlannedPage({ title, blurb, notice, children }: {
  title: string; blurb: string;
  /** Optional extra note rendered inside the same amber box (e.g. IRB gating). */
  notice?: { title: string; body: string };
  children?: ReactNode;
}) {
  return (
    <div>
      <h2 style={{ color: '#1e6b34' }}>{title}</h2>
      <p style={{ color: '#777', fontSize: 14, maxWidth: 560 }}>{blurb}</p>
      <div style={{ background: '#FDF6E3', border: '1px solid #F0D9A0',
        borderRadius: 6, padding: '12px 16px', marginTop: 16, maxWidth: 560 }}>
        <strong style={{ color: '#854F0B', fontSize: 13 }}>Not yet built</strong>
        <p style={{ color: '#854F0B', fontSize: 13, margin: '4px 0 0' }}>
          This area is on the roadmap but hasn't been implemented yet.
        </p>
        {notice && (
          <p style={{ color: '#854F0B', fontSize: 13, margin: '8px 0 0',
            borderTop: '1px solid #F0D9A0', paddingTop: 8 }}>
            <strong>{notice.title}:</strong> {notice.body}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
