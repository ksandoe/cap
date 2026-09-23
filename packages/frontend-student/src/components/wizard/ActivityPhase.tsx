/**
 * ActivityPhase.tsx — Phase 2: the learning activity.
 *
 * Renders the recipe's module steps in order; each step renders its content
 * blocks: rich text, embedded tool, knowledge check (formative, unrecorded),
 * checklist (self-verification), and branching note (conditional content).
 *
 * "I have completed the activity" → confirmation → POST verify-sap →
 * poll verify-status every 3s → advance on SAP_VERIFIED, or show which
 * document types are missing / a connectivity error and allow retry.
 *
 * TODO (Phase 2): gate enforcement per step, step completion state.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useSessionStore } from '../../store/sessionStore';
import type {
  ContentBlock, ModuleStep, EmbeddedToolBlock, KnowledgeCheckBlock,
  KnowledgeCheckQuestion, ChecklistBlock, BranchingNoteBlock,
} from '@cap/shared';

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS  = 60_000; // client-side ceiling; SAP query itself times out server-side

export function ActivityPhase() {
  const sessionId = useSessionStore(s => s.sessionId);
  const recipe    = useSessionStore(s => s.recipe);
  const setPhase  = useSessionStore(s => s.setPhase);

  const [confirming, setConfirming] = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

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

  const stub  = recipe?.contentStub;
  const steps = recipe?.steps ?? [];

  return (
    <div>
      <h2>Your activity</h2>

      {stub?.summaryText && <p style={{ lineHeight: 1.7 }}>{stub.summaryText}</p>}

      {!!stub?.resourceLinks?.length && (
        <ul className="resource-links">
          {stub.resourceLinks.map(l => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
              {l.type && <span className="tag">{l.type}</span>}
            </li>
          ))}
        </ul>
      )}

      {steps.map(step => <StepView key={step.stepId} step={step} />)}

      {error && <div className="notice error" role="alert">{error}</div>}

      {!confirming && !verifying && (
        <button className="primary" onClick={() => setConfirming(true)}>
          I have completed the activity
        </button>
      )}

      {confirming && (
        <div className="notice">
          <p>Have you finished all of the steps above?</p>
          <button className="primary" onClick={startVerification}>Yes, check my work</button>
          <button className="secondary" onClick={() => setConfirming(false)}>Not yet</button>
        </div>
      )}

      {verifying && (
        <p className="muted" role="status">Checking your work — this usually takes a few seconds…</p>
      )}
    </div>
  );
}

// ── Step ──────────────────────────────────────────────────────────────────────

function StepView({ step }: { step: ModuleStep }) {
  return (
    <section className="step">
      <h3>
        <span className="step-num">{step.stepNumber}</span> {step.title}
      </h3>
      {step.description && <p className="muted" style={{ marginTop: 0 }}>{step.description}</p>}
      {(step.blocks ?? []).map(b => <BlockView key={b.blockId} block={b} />)}
    </section>
  );
}

// ── Block dispatch ────────────────────────────────────────────────────────────

function BlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'rich_text':       return <RichText b={block} />;
    case 'embedded_tool':   return <EmbeddedTool b={block} />;
    case 'knowledge_check': return <KnowledgeCheck b={block} />;
    case 'checklist':       return <Checklist b={block} />;
    case 'branching_note':  return <BranchingNote b={block} />;
    default:                return null;
  }
}

function RichText({ b }: { b: Extract<ContentBlock, { type: 'rich_text' }> }) {
  return (
    <div className="block rich">
      {b.title && <h3>{b.title}</h3>}
      <p style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{b.body}</p>
    </div>
  );
}

function EmbeddedTool({ b }: { b: EmbeddedToolBlock }) {
  return (
    <div className="block tool">
      <h3>
        {b.title}
        <span className="tag">{b.tool}</span>
        {b.isGate && <span className="tag">required</span>}
      </h3>
      {b.taskPrompt && <p style={{ lineHeight: 1.7 }}>{b.taskPrompt}</p>}
      {b.url && b.launch === 'embed' && (
        <iframe src={b.url} title={b.title}
          style={{ width: '100%', minHeight: 420, border: '1px solid #d8dee9', borderRadius: 6 }} />
      )}
      {b.url && b.launch === 'link' && (
        <p><a className="tool-link" href={b.url} target="_blank" rel="noreferrer">
          Open {b.tool} ↗
        </a></p>
      )}
    </div>
  );
}

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

function BranchingNote({ b }: { b: BranchingNoteBlock }) {
  const [pathId, setPathId] = useState<string | null>(null);
  const path = b.paths.find(p => p.pathId === pathId);
  return (
    <div className="block branch">
      <h3>{b.trigger}</h3>
      <div className="options">
        {b.paths.map(p => (
          <button key={p.pathId}
            className={pathId === p.pathId ? 'branch-path active' : 'branch-path'}
            onClick={() => setPathId(pathId === p.pathId ? null : p.pathId)}>
            {p.label}
          </button>
        ))}
      </div>
      {path && <p style={{ lineHeight: 1.7, marginBottom: 0 }}>{path.body}</p>}
    </div>
  );
}
