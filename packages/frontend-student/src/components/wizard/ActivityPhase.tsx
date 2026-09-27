/**
 * ActivityPhase.tsx — Phase 2: the learning activity, one wizard screen
 * per module step.
 *
 * Each step renders its content blocks in order:
 *   rich text (sanitized HTML), guided tool (instructions with per-student
 *   {param} substitution, lightweight branches, progress bar, app frame),
 *   knowledge check (formative, unrecorded), checklist (self-verification).
 *
 * On the final step, "I have completed the activity" → confirmation →
 * POST verify-sap → poll verify-status every 3s → advance on SAP_VERIFIED.
 *
 * TODO (Phase 2): gate enforcement per step, persisted completion state.
 */
import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { api } from '../../services/api';
import { useSessionStore } from '../../store/sessionStore';
import type {
  ContentBlock, ModuleStep, GuidedToolBlock, GuidedInstruction,
  KnowledgeCheckBlock, KnowledgeCheckQuestion, ChecklistBlock,
} from '@cap/shared';

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS  = 60_000; // client-side ceiling; SAP query itself times out server-side

export function ActivityPhase() {
  const sessionId    = useSessionStore(s => s.sessionId);
  const recipe       = useSessionStore(s => s.recipe);
  const activityStep = useSessionStore(s => s.activityStep);
  const setStep      = useSessionStore(s => s.setActivityStep);
  const setPhase     = useSessionStore(s => s.setPhase);

  const [confirming, setConfirming] = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const steps = recipe?.steps ?? [];
  const step  = steps[activityStep];
  const isLast = activityStep === steps.length - 1;

  async function startVerification() {
    if (!sessionId || verifying) return;
    setConfirming(false);
    setVerifying(true);
    setError(null);
    try {
      await api.session.verifySap(sessionId);
    } catch (e: any) {
      setError('Verification could not be started. Please try again in a moment.');
      setVerifying(false);
      return;
    }

    const started = Date.now();
    pollRef.current = setInterval(async () => {
      try {
        const { status, sapVerificationError } = await api.session.verifyStatus(sessionId!);
        if (status === 'SAP_VERIFIED') {
          stopPolling();
          setPhase(3);
        } else if ((status === 'LEARNING' || status === 'ACTIVITY') && sapVerificationError) {
          stopPolling();
          const missing = sapVerificationError.missingTypes?.length
            ? `The following items weren't found yet: ${sapVerificationError.missingTypes.join(', ')}. ` +
              'Complete them and try again.'
            : 'The system that checks your work is temporarily unavailable. Please try again in a few minutes.';
          setError(missing);
        } else if (Date.now() - started > POLL_TIMEOUT_MS) {
          stopPolling();
          setError('Verification is taking longer than expected. Please try again.');
        }
      } catch {
        stopPolling();
        setError('Lost connection while verifying. Please try again.');
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setVerifying(false);
  }

  if (!step) {
    return <p className="muted">This module has no activity steps yet.</p>;
  }

  return (
    <div>
      <h2>{step.title}</h2>
      {step.description && <p className="muted" style={{ marginTop: 0 }}>{step.description}</p>}

      {step.blocks.map(b => <BlockView key={b.blockId} block={b} />)}

      {error && <div className="notice error" role="alert">{error}</div>}

      {confirming && (
        <div className="notice">
          <p>Have you finished all of the steps in this module?</p>
          <button className="primary" onClick={startVerification}>Yes, check my work</button>
          <button className="secondary" onClick={() => setConfirming(false)}>Not yet</button>
        </div>
      )}

      {verifying && (
        <p className="muted" role="status">Checking your work — this usually takes a few seconds…</p>
      )}

      <div className="step-nav">
        <button className="secondary" disabled={activityStep === 0}
          onClick={() => setStep(activityStep - 1)}>
          ← Back
        </button>
        {!isLast && (
          <button className="primary" onClick={() => setStep(activityStep + 1)}>
            Next: {steps[activityStep + 1].title} →
          </button>
        )}
        {isLast && !confirming && !verifying && (
          <button className="primary" onClick={() => setConfirming(true)}>
            I have completed the activity
          </button>
        )}
      </div>
    </div>
  );
}

// ── Block dispatch ────────────────────────────────────────────────────────────

function BlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'rich_text':       return <RichText b={block} />;
    case 'guided_tool':     return <GuidedTool b={block} />;
    case 'knowledge_check': return <KnowledgeCheck b={block} />;
    case 'checklist':       return <Checklist b={block} />;
    default:                return null;
  }
}

function RichText({ b }: { b: Extract<ContentBlock, { type: 'rich_text' }> }) {
  // Bodies authored in the rich text editor are HTML; older plain-text /
  // markdown drafts render as-is.
  const isHtml = /<\/?[a-z][^>]*>/i.test(b.body);
  return (
    <div className="block rich">
      {b.title && <h3>{b.title}</h3>}
      {isHtml
        ? <div className="rich-body"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(b.body) }} />
        : <p style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{b.body}</p>}
    </div>
  );
}

// ── Guided tool ───────────────────────────────────────────────────────────────
//
// Instructions with inline {param} substitution, per-instruction branches,
// a self-reported progress bar, and the framed (or linked) application.

/** Render instruction text with {key} placeholders swapped for the
 *  student's assigned values, highlighted inline. Unknown keys render
 *  literally so authors see their mistake rather than a blank. */
function ParamText({ text }: { text: string }) {
  const params = useSessionStore(s => s.parameters);
  const parts = text.split(/(\{[a-zA-Z0-9_]+\})/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\{(.+)\}$/);
        if (m && params[m[1]] !== undefined)
          return <kbd key={i} className="param">{params[m[1]]}</kbd>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Instruction bodies may be rich HTML (Quill editor). Substitute {key}
 *  placeholders as escaped values wrapped in <kbd>, then sanitize — params
 *  can never inject markup, and author HTML is cleaned before render.
 *  Legacy plain-text instructions keep the simple component path. */
function InstructionText({ text }: { text: string }) {
  const params = useSessionStore(s => s.parameters);
  if (!/<\/?[a-z][^>]*>/i.test(text)) return <ParamText text={text} />;
  const subbed = text.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, key) =>
    params[key] !== undefined
      ? `<kbd class="param">${escapeHtml(String(params[key]))}</kbd>` : m);
  return <div className="rich-body"
    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(subbed) }} />;
}

function GuidedTool({ b }: { b: GuidedToolBlock }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setDone(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const total = b.instructions.length;
  const pct   = total ? Math.round((done.size / total) * 100) : 0;

  const instructions = (
    <ol className="guided-steps">
      {b.instructions.map(ins => (
        <GuidedInstructionRow key={ins.instructionId} ins={ins}
          done={done.has(ins.instructionId)} onToggle={() => toggle(ins.instructionId)} />
      ))}
    </ol>
  );

  const frame = b.url ? (
    <iframe src={b.url} title={b.title} className="tool-frame" />
  ) : (
    <div className="tool-frame tool-frame-placeholder">
      <strong>{b.tool}</strong> workspace
      <span className="muted" style={{ fontSize: 13 }}>
        {b.tool === 'sap'
          ? 'Your assigned SAP sandbox opens in a separate window — use your pool account credentials.'
          : 'This tool opens in a separate window.'}
      </span>
      <span className="muted" style={{ fontSize: 12 }}>
        (Framed embedding will appear here once the tool URL is configured)
      </span>
    </div>
  );

  return (
    <div className="block guided">
      <h3>
        {b.title}
        <span className="tag">{b.tool}</span>
        {b.isGate && <span className="tag">required</span>}
      </h3>

      <div className="guided-progress" role="status" aria-label={`${done.size} of ${total} instructions done`}>
        <div className="guided-progress-bar" style={{ width: `${pct}%` }} />
        <span className="guided-progress-label">{done.size} of {total} done</span>
      </div>

      <div className={`guided-layout ${b.layout === 'side_by_side' ? 'side' : 'stacked'}`}>
        <div className="guided-instructions">{instructions}</div>
        <div className="guided-frame">{frame}</div>
      </div>

      {b.url && (
        <p style={{ marginBottom: 0 }}>
          <a className="tool-link" href={b.url} target="_blank" rel="noreferrer">
            Open {b.tool} in a new tab ↗
          </a>
        </p>
      )}
    </div>
  );
}

function GuidedInstructionRow({ ins, done, onToggle }: {
  ins: GuidedInstruction; done: boolean; onToggle: () => void;
}) {
  const [openBranch, setOpenBranch] = useState<string | null>(null);
  return (
    <li className={done ? 'guided-step done' : 'guided-step'}>
      <label className="option" style={{ alignItems: 'flex-start' }}>
        <input type="checkbox" checked={done} onChange={onToggle} style={{ marginTop: 3 }} />
        <div style={{ flex: 1 }}><InstructionText text={ins.text} /></div>
      </label>
      {!!ins.branches?.length && (
        <div className="guided-branches">
          {ins.branches.map(br => (
            <div key={br.branchId}>
              <button type="button" className="branch-link"
                onClick={() => setOpenBranch(openBranch === br.branchId ? null : br.branchId)}>
                {openBranch === br.branchId ? '▾' : '▸'} {br.condition}
              </button>
              {openBranch === br.branchId && (
                <div className="branch-body"><InstructionText text={br.text} /></div>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

// ── Knowledge check / checklist ───────────────────────────────────────────────

function KnowledgeCheck({ b }: { b: KnowledgeCheckBlock }) {
  return (
    <div className="block kc">
      <h3>{b.title ?? 'Check your understanding'}
        <span className="tag">self-check — not graded</span>
      </h3>
      {b.questions.map(q => <Question key={q.questionId} q={q} />)}
    </div>
  );
}

function Question({ q }: { q: KnowledgeCheckQuestion }) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const answered = answer !== null;
  const correct  = answered && q.correctAnswer != null &&
    answer!.toLowerCase() === q.correctAnswer.toLowerCase();

  return (
    <div className="kc-q">
      <p style={{ fontWeight: 600, marginBottom: 6 }}>{q.prompt}</p>

      {q.type === 'multiple_choice' && (q.options ?? []).map(o => (
        <label key={o} className="option">
          <input type="radio" name={q.questionId} disabled={answered}
            checked={answer === o} onChange={() => setAnswer(o)} />
          {o}
        </label>
      ))}

      {q.type === 'true_false' && ['true', 'false'].map(v => (
        <label key={v} className="option">
          <input type="radio" name={q.questionId} disabled={answered}
            checked={answer === v} onChange={() => setAnswer(v)} />
          {v === 'true' ? 'True' : 'False'}
        </label>
      ))}

      {q.type === 'short_answer' && (
        <>
          <textarea rows={2} style={{ width: '100%', marginTop: 4, font: 'inherit',
            padding: '8px 10px', border: '1px solid #c5c5c2', borderRadius: 6 }}
            placeholder="Type your answer…" />
          {q.correctAnswer && !revealed && (
            <button className="secondary" style={{ margin: '8px 0 0' }}
              onClick={() => setRevealed(true)}>Show sample answer</button>
          )}
          {revealed && <p className="muted" style={{ marginBottom: 0 }}>{q.correctAnswer}</p>}
        </>
      )}

      {answered && (
        <p className={correct ? 'kc-correct' : 'kc-incorrect'}>
          {correct ? 'Correct. ' : 'Not quite. '}{q.feedback}
        </p>
      )}
    </div>
  );
}

function Checklist({ b }: { b: ChecklistBlock }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setDone(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  return (
    <div className="block checklist">
      <h3>{b.title ?? 'Confirm before continuing'}
        <span className="tag">{done.size} of {b.items.length}</span>
      </h3>
      {b.items.map(it => (
        <label key={it.itemId} className="option">
          <input type="checkbox" checked={done.has(it.itemId)} onChange={() => toggle(it.itemId)} />
          {it.label}
        </label>
      ))}
    </div>
  );
}
