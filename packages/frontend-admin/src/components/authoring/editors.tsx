/**
 * editors.tsx — Shared authoring editor machinery (v3).
 *
 * Extracted from the old single-page RecipeFormPage so the wizard's
 * section screens can reuse the same building blocks:
 *   - style shorthands matching the scaffold's inline-style look
 *   - list helpers (ListEditor, Move, move)
 *   - Quill toolbar configs + image upload/downscale helpers
 *   - block factories + the per-type BlockEditor (rich text, guided
 *     tool, knowledge check, checklist)
 *   - AiBadge — flags fields the generation dialog drafted
 */
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import type {
  ContentBlock, ModuleStep, GuidedToolBlock, GuidedInstruction,
  KnowledgeCheckBlock, KnowledgeCheckQuestion, ChecklistBlock, RichTextBlock,
} from '@cap/shared';

// ── style shorthands ──────────────────────────────────────────────────────────
export const input: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' };
export const lbl: React.CSSProperties   = { fontWeight: 600, fontSize: 13, color: '#333', display: 'block', marginBottom: 4 };
export const smallBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 12, border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer' };
export const addBtn: React.CSSProperties   = { ...smallBtn, color: '#1e6b34', borderColor: '#1e6b34' };

export function uid() { return Math.random().toString(36).slice(2, 10); }

// ── factories ─────────────────────────────────────────────────────────────────
export function newStep(n: number): ModuleStep {
  return { stepId: `st-${uid()}`, stepNumber: n, title: '', description: '',
    blocks: [], outcomeTagIndices: [], understandingNote: '' };
}

export function newBlock(type: ContentBlock['type']): ContentBlock {
  const blockId = `blk-${uid()}`;
  switch (type) {
    case 'rich_text':       return { blockId, type, title: '', body: '' } as RichTextBlock;
    case 'guided_tool':     return { blockId, type, title: '', tool: 'sap', url: '',
        layout: 'side_by_side', instructions: [], isGate: true } as GuidedToolBlock;
    case 'knowledge_check': return { blockId, type, title: '', questions: [] } as KnowledgeCheckBlock;
    case 'checklist':       return { blockId, type, title: '', items: [] } as ChecklistBlock;
  }
}

/** Visible text length of a rich-text body (strips HTML for validation). */
export function bodyText(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

export const BLOCK_LABELS: Record<ContentBlock['type'], string> = {
  rich_text:       'Rich text',
  guided_tool:     'Guided tool',
  knowledge_check: 'Knowledge check',
  checklist:       'Checklist',
};

// ── AI-draft badge ────────────────────────────────────────────────────────────
/** Shown next to fields the generation dialog drafted — cue to review. */
export function AiBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span style={{
      marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#7a4d00',
      background: '#fdf0d5', border: '1px solid #ecd9a8', borderRadius: 10,
      padding: '1px 8px', verticalAlign: 'middle', letterSpacing: 0.4,
    }}>
      AI DRAFT — REVIEW
    </span>
  );
}

// ── per-section help block (interview feedback: guidance over guesswork) ──────
export function HelpBlock({ what, example }: { what: string; example?: string }) {
  return (
    <div style={{ fontSize: 12, color: '#777', background: '#f4faf6',
      border: '1px solid #dfe7e0', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
      <div>{what}</div>
      {example && <div style={{ marginTop: 4, color: '#555' }}><em>Example: {example}</em></div>}
    </div>
  );
}

// ── list helpers ──────────────────────────────────────────────────────────────
export function ListEditor({ items, renderItem, onAdd, addLabel }: {
  items: any[]; onAdd: () => void; addLabel: string;
  renderItem: (item: any, i: number) => React.ReactNode;
}) {
  return (
    <div>
      {items.map((it, i) => renderItem(it, i))}
      <button type="button" style={addBtn} onClick={onAdd}>+ {addLabel}</button>
    </div>
  );
}

export function Move({ onUp, onDown, onDel, first, last }: {
  onUp: () => void; onDown: () => void; onDel: () => void; first: boolean; last: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <button type="button" style={smallBtn} disabled={first} onClick={onUp}>↑</button>
      <button type="button" style={smallBtn} disabled={last}  onClick={onDown}>↓</button>
      <button type="button" style={{ ...smallBtn, color: '#a33' }} onClick={onDel}>✕</button>
    </span>
  );
}

export function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir; if (j < 0 || j >= arr.length) return arr;
  const c = [...arr]; [c[i], c[j]] = [c[j], c[i]]; return c;
}

/** Quill toolbar configs — factory so each editor gets the image-upload
 *  handler bound to the component (uploads to cap-assets via /admin/images
 *  rather than embedding base64 into the recipe JSON). */
export const quillModules = (imageHandler: () => void) => ({
  toolbar: {
    container: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'blockquote'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link', 'image'],
      ['clean'],
    ],
    handlers: { image: imageHandler },
  },
});

/** Slimmer toolbar for inline fields like guided-tool instructions. */
export const quillModulesInline = (imageHandler: () => void) => ({
  toolbar: {
    container: [
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link', 'image'],
      ['clean'],
    ],
    handlers: { image: imageHandler },
  },
});

// ── image upload helpers ──────────────────────────────────────────────────────
// Small images pass through unchanged (keeps PNG transparency). Larger
// screenshots are downscaled on a canvas and re-encoded as JPEG so the
// base64 payload stays under the backend's ~280KB decoded limit (which in
// turn keeps the DynamoDB item under 400KB).

const IMAGE_PASS_THROUGH = 250 * 1024;
const IMAGE_MAX_BYTES    = 270 * 1024;
const IMAGE_MAX_WIDTH    = 1400;

function readAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error('Could not read the image file.'));
    r.readAsDataURL(file);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That file is not a readable image.')); };
    img.src = url;
  });
}

export async function prepareImage(file: File): Promise<{ dataUrl: string; contentType: string }> {
  if (file.size <= IMAGE_PASS_THROUGH)
    return { dataUrl: await readAsDataURL(file), contentType: file.type };
  const img = await loadImage(file);
  let { width, height } = img;
  if (width > IMAGE_MAX_WIDTH) {
    height = Math.round(height * IMAGE_MAX_WIDTH / width);
    width = IMAGE_MAX_WIDTH;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image in this browser.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (Math.round(url.length * 3 / 4) <= IMAGE_MAX_BYTES)
      return { dataUrl: url, contentType: 'image/jpeg' };
  }
  throw new Error('Screenshot is still too large after downscaling — crop it tighter.');
}

// ── block editor ──────────────────────────────────────────────────────────────
export function BlockEditor({ block, onChange, onMove, onDel, first, last, imageUpload }: {
  block: ContentBlock;
  onChange: (b: ContentBlock) => void;
  onMove: (dir: -1 | 1) => void;
  onDel: () => void;
  first: boolean; last: boolean;
  imageUpload: () => void;
}) {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 12, marginBottom: 8, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#666' }}>
          {BLOCK_LABELS[block.type]}
          {block.type === 'guided_tool' && block.isGate ? ' · gate' : ''}
        </span>
        <Move first={first} last={last} onUp={() => onMove(-1)} onDown={() => onMove(1)} onDel={onDel} />
      </div>

      {block.type === 'rich_text' && (
        <>
          <input style={{ ...input, marginBottom: 8 }} placeholder="Heading (optional)" value={block.title ?? ''}
            onChange={e => onChange({ ...block, title: e.target.value })} />
          <div style={{ background: '#fff', borderRadius: 4, marginBottom: 8 }}>
            <ReactQuill theme="snow" value={block.body}
              onChange={html => onChange({ ...block, body: html })}
              placeholder="Body — prose, instructions, callouts"
              modules={quillModules(imageUpload)} />
          </div>
        </>
      )}

      {block.type === 'guided_tool' && (
        <GuidedToolEditor block={block} onChange={onChange} imageUpload={imageUpload} />
      )}

      {block.type === 'knowledge_check' && (
        <>
          <input style={{ ...input, marginBottom: 8 }} placeholder="Title (optional, e.g. Quick self-check)" value={block.title ?? ''}
            onChange={e => onChange({ ...block, title: e.target.value })} />
          <QuestionList questions={block.questions}
            onChange={questions => onChange({ ...block, questions })} />
          <div style={{ fontSize: 12, color: '#888' }}>Formative only — immediate feedback, nothing recorded.</div>
        </>
      )}

      {block.type === 'checklist' && (
        <>
          <input style={{ ...input, marginBottom: 8 }} placeholder="Title (optional, e.g. Before you continue)" value={block.title ?? ''}
            onChange={e => onChange({ ...block, title: e.target.value })} />
          <ListEditor items={block.items} addLabel="Add item"
            onAdd={() => onChange({ ...block, items: [...block.items, { itemId: `i-${uid()}`, label: '' }] })}
            renderItem={(it, i) => (
              <div key={it.itemId} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input style={input} placeholder='"I have done X"' value={it.label}
                  onChange={e => onChange({ ...block, items: block.items.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
                <Move first={i === 0} last={i === block.items.length - 1}
                  onUp={() => onChange({ ...block, items: move(block.items, i, -1) })}
                  onDown={() => onChange({ ...block, items: move(block.items, i, 1) })}
                  onDel={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })} />
              </div>
            )} />
          <div style={{ fontSize: 12, color: '#888' }}>Self-verification of actions taken — distinct from comprehension checks.</div>
        </>
      )}

    </div>
  );
}

// ── guided tool editor ────────────────────────────────────────────────────────
function GuidedToolEditor({ block, onChange, imageUpload }: {
  block: GuidedToolBlock;
  onChange: (b: GuidedToolBlock) => void;
  imageUpload: () => void;
}) {
  const setIns = (i: number, patch: Partial<GuidedInstruction>) =>
    onChange({ ...block, instructions: block.instructions.map((x, j) => j === i ? { ...x, ...patch } : x) });

  return (
    <>
      <input style={{ ...input, marginBottom: 8 }} placeholder="Title (required)" value={block.title}
        onChange={e => onChange({ ...block, title: e.target.value })} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input style={{ ...input, flex: 1 }} placeholder="Tool name (e.g. sap)" value={block.tool}
          onChange={e => onChange({ ...block, tool: e.target.value })} />
        <select style={{ ...input, width: 170 }} value={block.layout}
          onChange={e => onChange({ ...block, layout: e.target.value as GuidedToolBlock['layout'] })}>
          <option value="side_by_side">Instructions beside app</option>
          <option value="stacked">Instructions above app</option>
        </select>
      </div>
      <input style={{ ...input, marginBottom: 10 }} placeholder="App URL (optional — framed in place when set)" value={block.url ?? ''}
        onChange={e => onChange({ ...block, url: e.target.value })} />

      <label style={lbl}>Instructions — use {'{key}'} for parameter values</label>
      <ListEditor items={block.instructions} addLabel="Add instruction"
        onAdd={() => onChange({ ...block, instructions: [...block.instructions, { instructionId: `gi-${uid()}`, text: '', branches: [] }] })}
        renderItem={(ins: GuidedInstruction, i: number) => (
          <div key={ins.instructionId} style={{ marginBottom: 8, padding: 8, background: '#f7f9fc', borderRadius: 4 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, background: '#fff', borderRadius: 4 }} className="quill-inline">
                <ReactQuill theme="snow" value={ins.text}
                  onChange={html => setIns(i, { text: html })}
                  placeholder={'e.g. Enter {orderQty} in the Quantity field'}
                  modules={quillModulesInline(imageUpload)} />
              </div>
              <Move first={i === 0} last={i === block.instructions.length - 1}
                onUp={() => onChange({ ...block, instructions: move(block.instructions, i, -1) })}
                onDown={() => onChange({ ...block, instructions: move(block.instructions, i, 1) })}
                onDel={() => onChange({ ...block, instructions: block.instructions.filter((_, j) => j !== i) })} />
            </div>
            {(ins.branches ?? []).map((br, bi) => (
              <div key={br.branchId} style={{ display: 'flex', gap: 6, marginBottom: 4, marginLeft: 12 }}>
                <input style={{ ...input, flex: 1, fontSize: 12 }} placeholder='If … (condition)' value={br.condition}
                  onChange={e => setIns(i, { branches: ins.branches!.map((x, j) => j === bi ? { ...x, condition: e.target.value } : x) })} />
                <input style={{ ...input, flex: 2, fontSize: 12 }} placeholder="then — alternative instruction" value={br.text}
                  onChange={e => setIns(i, { branches: ins.branches!.map((x, j) => j === bi ? { ...x, text: e.target.value } : x) })} />
                <button type="button" style={{ ...smallBtn, color: '#a33' }}
                  onClick={() => setIns(i, { branches: ins.branches!.filter((_, j) => j !== bi) })}>✕</button>
              </div>
            ))}
            <button type="button" style={{ ...smallBtn, fontSize: 11, marginLeft: 12 }}
              onClick={() => setIns(i, { branches: [...(ins.branches ?? []), { branchId: `gb-${uid()}`, condition: '', text: '' }] })}>
              + branch
            </button>
          </div>
        )} />
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
        Check off instructions to drive the student's progress bar. Branches are
        lightweight "if you hit X → do Y" variants shown on demand.
      </div>

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginTop: 8 }}>
        <input type="checkbox" checked={block.isGate}
          onChange={e => onChange({ ...block, isGate: e.target.checked })} />
        Gate — student must complete this tool task before continuing
      </label>
    </>
  );
}

function QuestionList({ questions, onChange }: {
  questions: KnowledgeCheckQuestion[];
  onChange: (q: KnowledgeCheckQuestion[]) => void;
}) {
  const setQ = (i: number, patch: Partial<KnowledgeCheckQuestion>) =>
    onChange(questions.map((q, j) => j === i ? { ...q, ...patch } : q));
  return (
    <div>
      {questions.map((q, i) => (
        <div key={q.questionId} style={{ marginBottom: 8, padding: 8, background: '#f7f9fc', borderRadius: 4 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <select style={{ ...input, width: 150 }} value={q.type}
              onChange={e => setQ(i, { type: e.target.value as KnowledgeCheckQuestion['type'] })}>
              <option value="multiple_choice">Multiple choice</option>
              <option value="true_false">True / False</option>
              <option value="short_answer">Short answer</option>
            </select>
            <input style={input} placeholder="Question prompt" value={q.prompt}
              onChange={e => setQ(i, { prompt: e.target.value })} />
            <Move first={i === 0} last={i === questions.length - 1}
              onUp={() => onChange(move(questions, i, -1))}
              onDown={() => onChange(move(questions, i, 1))}
              onDel={() => onChange(questions.filter((_, j) => j !== i))} />
          </div>
          {q.type === 'multiple_choice' && (
            <textarea style={{ ...input, minHeight: 50, fontSize: 13 }}
              placeholder={'Options — one per line'} value={(q.options ?? []).join('\n')}
              onChange={e => setQ(i, { options: e.target.value.split('\n') })} />
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input style={{ ...input, flex: 1, fontSize: 13 }} value={q.correctAnswer ?? ''}
              placeholder={q.type === 'true_false' ? 'Correct answer: true / false'
                : q.type === 'short_answer' ? 'Sample answer (revealed on demand)'
                : 'Correct answer (must match an option)'}
              onChange={e => setQ(i, { correctAnswer: e.target.value })} />
            <input style={{ ...input, flex: 1, fontSize: 13 }} value={q.feedback ?? ''}
              placeholder="Feedback shown after answering"
              onChange={e => setQ(i, { feedback: e.target.value })} />
          </div>
        </div>
      ))}
      <button type="button" style={{ ...addBtn, fontSize: 12 }}
        onClick={() => onChange([...questions, { questionId: `q-${uid()}`, type: 'multiple_choice', prompt: '', options: ['', ''], correctAnswer: '', feedback: '' }])}>
        + Add question
      </button>
    </div>
  );
}
