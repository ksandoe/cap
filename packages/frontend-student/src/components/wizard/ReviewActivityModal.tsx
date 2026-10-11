/**
 * ReviewActivityModal.tsx — v3: read-only view of the student's completed
 * activity, available during the checkout conversation and on the summary.
 *
 * Prototype finding: students wanted to look back at what they did while
 * answering the agent's questions. Review is distinct from redo — nothing
 * here is editable; ticks and check state render from the session store.
 */
import { useSessionStore } from '../../store/sessionStore';
import { BlockView } from './blocks';

export function ReviewActivityModal({ onClose }: { onClose: () => void }) {
  const recipe = useSessionStore(s => s.recipe);
  const steps  = recipe?.steps ?? [];

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true"
      aria-label="Review your activity" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>Review what you did</h3>
          <button className="secondary" onClick={onClose} autoFocus>Close</button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          A read-only look at your completed activity — your ticks are shown
          as you left them. To change your work, use “Redo the activity”.
        </p>
        {steps.map((step, i) => (
          <section key={step.stepId ?? i} className="modal-step">
            <h4>{i + 1}. {step.title}</h4>
            {step.description && <p className="muted" style={{ marginTop: 0 }}>{step.description}</p>}
            {step.blocks.map(b => <BlockView key={b.blockId} block={b} readOnly />)}
          </section>
        ))}
      </div>
    </div>
  );
}
