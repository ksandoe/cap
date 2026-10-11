/**
 * blocks.tsx — Content-block renderers, shared by the activity phase and
 * the read-only "Review what you did" modal (v3).
 *
 * Extracted from ActivityPhase.tsx so the same rendering serves both the
 * interactive activity and the review view. `readOnly` disables all
 * interaction (checkboxes, answering) while preserving stored state —
 * ticks and check state still render from the session store.
 */
import { useState } from 'react';
import DOMPurify from 'dompurify';
import { api } from '../../services/api';
import { useSessionStore } from '../../store/sessionStore';
import type {
  ContentBlock, GuidedToolBlock, GuidedInstruction,
  KnowledgeCheckBlock, KnowledgeCheckQuestion, ChecklistBlock,
} from '@cap/shared';

// ── Block dispatch ────────────────────────────────────────────────────────────

export function BlockView({ block, readOnly = false }: { block: ContentBlock; readOnly?: boolean }) {
  switch (block.type) {
    case 'rich_text':       return <RichText b={block} />;
    case 'guided_tool':     return <GuidedTool b={block} readOnly={readOnly} />;
    case 'knowledge_check': return <KnowledgeCheck b={block} readOnly={readOnly} />;
    case 'checklist':       return <Checklist b={block} readOnly={readOnly} />;
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

/** Persist activity position to the session record — fire-and-forget.
 *  Posted on step changes and instruction/checklist toggles, so resume
 *  (saved or interrupted) restores exact position, not just the phase. */
export function postProgress(step?: number) {
  const { sessionId, activityStep, instructionDone } = useSessionStore.getState();
  if (!sessionId) return;
  api.session.progress(sessionId, {
    activityStep: step ?? activityStep,
    instructionDone,
  }).catch(() => { /* position checkpoint — non-fatal */ });
}

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

function GuidedTool({ b, readOnly }: { b: GuidedToolBlock; readOnly: boolean }) {
  // Ticks live in the session store (per blockId) so they persist to the
  // session record and restore on resume — and show in the review modal.
  const doneIds  = useSessionStore(s => s.instructionDone[b.blockId] ?? []);
  const toggleItem = useSessionStore(s => s.toggleInstructionItem);
  const done = new Set(doneIds);
  const toggle = (id: string) => { toggleItem(b.blockId, id); postProgress(); };
  const total = b.instructions.length;
  const pct   = total ? Math.round((done.size / total) * 100) : 0;

  const instructions = (
    <ol className="guided-steps">
      {b.instructions.map(ins => (
        <GuidedInstructionRow key={ins.instructionId} ins={ins}
          done={done.has(ins.instructionId)} readOnly={readOnly}
          onToggle={() => toggle(ins.instructionId)} />
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

function GuidedInstructionRow({ ins, done, readOnly, onToggle }: {
  ins: GuidedInstruction; done: boolean; readOnly: boolean; onToggle: () => void;
}) {
  const [openBranch, setOpenBranch] = useState<string | null>(null);
  return (
    <li className={done ? 'guided-step done' : 'guided-step'}>
      <label className="option" style={{ alignItems: 'flex-start' }}>
        <input type="checkbox" checked={done} onChange={onToggle}
          disabled={readOnly} style={{ marginTop: 3 }} />
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

function KnowledgeCheck({ b, readOnly }: { b: KnowledgeCheckBlock; readOnly: boolean }) {
  return (
    <div className="block kc">
      <h3>{b.title ?? 'Check your understanding'}
        <span className="tag">self-check — not graded</span>
      </h3>
      {b.questions.map(q => <Question key={q.questionId} q={q} readOnly={readOnly} />)}
    </div>
  );
}

function Question({ q, readOnly }: { q: KnowledgeCheckQuestion; readOnly: boolean }) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const answered = answer !== null;
  const correct  = answered && q.correctAnswer != null &&
    answer!.toLowerCase() === q.correctAnswer.toLowerCase();
  const locked   = answered || readOnly;

  return (
    <div className="kc-q">
      <p style={{ fontWeight: 600, marginBottom: 6 }}>{q.prompt}</p>

      {q.type === 'multiple_choice' && (q.options ?? []).map(o => (
        <label key={o} className="option">
          <input type="radio" name={q.questionId} disabled={locked}
            checked={answer === o} onChange={() => setAnswer(o)} />
          {o}
        </label>
      ))}

      {q.type === 'true_false' && ['true', 'false'].map(v => (
        <label key={v} className="option">
          <input type="radio" name={q.questionId} disabled={locked}
            checked={answer === v} onChange={() => setAnswer(v)} />
          {v === 'true' ? 'True' : 'False'}
        </label>
      ))}

      {q.type === 'short_answer' && (
        <>
          <textarea rows={2} style={{ width: '100%', marginTop: 4, font: 'inherit',
            padding: '8px 10px', border: '1px solid #c5c5c2', borderRadius: 6 }}
            placeholder="Type your answer…" disabled={readOnly} />
          {q.correctAnswer && !revealed && !readOnly && (
            <button className="secondary" style={{ margin: '8px 0 0' }}
              onClick={() => setRevealed(true)}>Show sample answer</button>
          )}
          {revealed && <p className="muted" style={{ marginBottom: 0 }}>{q.correctAnswer}</p>}
        </>
      )}

      {answered && !readOnly && (
        <p className={correct ? 'kc-correct' : 'kc-incorrect'}>
          {correct ? 'Correct. ' : 'Not quite. '}{q.feedback}
        </p>
      )}
    </div>
  );
}

function Checklist({ b, readOnly }: { b: ChecklistBlock; readOnly: boolean }) {
  const doneIds  = useSessionStore(s => s.instructionDone[b.blockId] ?? []);
  const toggleItem = useSessionStore(s => s.toggleInstructionItem);
  const done = new Set(doneIds);
  const toggle = (id: string) => { toggleItem(b.blockId, id); postProgress(); };
  return (
    <div className="block checklist">
      <h3>{b.title ?? 'Confirm before continuing'}
        <span className="tag">{done.size} of {b.items.length}</span>
      </h3>
      {b.items.map(it => (
        <label key={it.itemId} className="option">
          <input type="checkbox" checked={done.has(it.itemId)}
            disabled={readOnly} onChange={() => toggle(it.itemId)} />
          {it.label}
        </label>
      ))}
    </div>
  );
}
