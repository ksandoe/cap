/**
 * WizardShell.tsx — Shared chrome for the lifecycle wizard.
 *
 * Renders the module title, the full lifecycle progress rail
 * (Check-in → one item per module step → Reflect → Summary), a
 * Save & exit control, and the current screen's content.
 *
 * The rail is compact to survive long step counts: numbers are always
 * visible, the full label shows only for the current item (labels are
 * available as tooltips). The rail is informational — the student
 * navigates via Back/Next controls inside each screen, not by clicking
 * the rail.
 */
import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../store/sessionStore';
import { api } from '../../services/api';

export function WizardShell({ currentPhase, children }: { currentPhase: number; children: ReactNode }) {
  const moduleTitle  = useSessionStore(s => s.recipe?.moduleTitle);
  const steps        = useSessionStore(s => s.recipe?.steps) ?? [];
  const activityStep = useSessionStore(s => s.activityStep);
  const sessionId    = useSessionStore(s => s.sessionId);
  const navigate     = useNavigate();
  const [saving, setSaving] = useState(false);

  const items = [
    { label: 'Check-in' },
    ...steps.map(s => ({ label: s.title })),
    { label: 'Reflect' },
    { label: 'Summary' },
  ];
  const currentIndex =
    currentPhase === 1 ? 0 :
    currentPhase === 2 ? 1 + activityStep :
    currentPhase === 3 ? 1 + steps.length :
    2 + steps.length;

  async function saveAndExit() {
    if (!sessionId || saving) return;
    setSaving(true);
    try {
      const { resumeWithinDays } = await api.session.save(sessionId);
      navigate('/', {
        state: { notice: `Progress saved — relaunch the module within ${resumeWithinDays} days to pick up where you left off.` },
      });
    } catch {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#1D4E8C', color: '#fff', padding: '16px 32px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>Conversational Assessment Platform</div>
            <h1 style={{ margin: '2px 0 0', fontSize: 20 }}>
              {moduleTitle ?? 'Learning module'}
            </h1>
          </div>
          {sessionId && currentPhase < 4 && (
            <button onClick={saveAndExit} disabled={saving}
              style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(255,255,255,0.4)',
                color: '#fff', borderRadius: 4, padding: '5px 14px', cursor: 'pointer', fontSize: 13 }}>
              {saving ? 'Saving…' : 'Save & exit'}
            </button>
          )}
        </div>
      </header>

      <nav aria-label="Progress" style={{ background: '#fff', borderBottom: '1px solid #e2e2e0' }}>
        <ol style={{
          maxWidth: 860, margin: '0 auto', padding: '12px 32px',
          display: 'flex', gap: 6, listStyle: 'none', fontSize: 14,
          alignItems: 'center', flexWrap: 'wrap',
        }}>
          {items.map((item, i) => {
            const state = i === currentIndex ? 'current' : i < currentIndex ? 'done' : 'todo';
            return (
              <li key={i} title={item.label}
                aria-current={state === 'current' ? 'step' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  minWidth: 26, height: 26, borderRadius: 999, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 13,
                  background: state === 'current' ? '#1D4E8C' : state === 'done' ? '#e3ecf7' : '#f0f0ee',
                  color:      state === 'current' ? '#fff'    : state === 'done' ? '#1D4E8C' : '#777',
                  fontWeight: state === 'current' ? 600 : 400,
                }}>
                  {i + 1}
                </span>
                {state === 'current' && (
                  <span style={{ fontWeight: 600, color: '#1D4E8C' }}>{item.label}</span>
                )}
              </li>
            );
          })}
          <li style={{ marginLeft: 'auto', color: '#999', fontSize: 13 }}>
            Step {currentIndex + 1} of {items.length}
          </li>
        </ol>
      </nav>

      <main style={{ flex: 1, maxWidth: 860, width: '100%', margin: '0 auto', padding: '28px 32px 48px' }}>
        {children}
      </main>
    </div>
  );
}
