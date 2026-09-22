/**
 * WizardShell.tsx — Shared chrome for the four-phase wizard.
 *
 * Renders the module title, a phase progress indicator, and the
 * current phase's content. The student cannot navigate backward —
 * the indicator is informational, not a nav control.
 */
import { ReactNode } from 'react';
import { useSessionStore } from '../../store/sessionStore';

const PHASE_LABELS = ['Check-in', 'Activity', 'Conversation', 'Summary'];

export function WizardShell({ currentPhase, children }: { currentPhase: number; children: ReactNode }) {
  const moduleTitle = useSessionStore(s => s.recipe?.moduleTitle);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#1D4E8C', color: '#fff', padding: '16px 32px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Conversational Assessment Platform</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 20 }}>
            {moduleTitle ?? 'Learning module'}
          </h1>
        </div>
      </header>

      <nav aria-label="Progress" style={{ background: '#fff', borderBottom: '1px solid #e2e2e0' }}>
        <ol style={{
          maxWidth: 860, margin: '0 auto', padding: '12px 32px',
          display: 'flex', gap: 8, listStyle: 'none', fontSize: 14,
        }}>
          {PHASE_LABELS.map((label, i) => {
            const n = i + 1;
            const state = n === currentPhase ? 'current' : n < currentPhase ? 'done' : 'todo';
            return (
              <li
                key={label}
                aria-current={state === 'current' ? 'step' : undefined}
                style={{
                  padding: '4px 12px', borderRadius: 999,
                  background: state === 'current' ? '#1D4E8C' : state === 'done' ? '#e3ecf7' : '#f0f0ee',
                  color:      state === 'current' ? '#fff'    : state === 'done' ? '#1D4E8C' : '#777',
                  fontWeight: state === 'current' ? 600 : 400,
                }}
              >
                {n}. {label}
              </li>
            );
          })}
        </ol>
      </nav>

      <main style={{ flex: 1, maxWidth: 860, width: '100%', margin: '0 auto', padding: '28px 32px 48px' }}>
        {children}
      </main>
    </div>
  );
}
