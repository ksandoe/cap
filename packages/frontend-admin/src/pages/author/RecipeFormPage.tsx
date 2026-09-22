/**
 * RecipeFormPage.tsx — the domain-expert authoring form (AUT-01..09).
 *
 * Sections:
 *   1. Module identity      — module ID, title, description
 *   2. Learning outcomes    — numbered list (min 2)
 *   3. Key concepts         — term + definition pairs
 *   4. Content blocks       — conceptual / instructional / SAP blocks with
 *                             gate flags, reordering, a nested step editor,
 *                             and concurrent-pair assignment
 *   5. Instructional recipe — rubric dimensions, probing rules, vague answer
 *                             triggers, career transfer prompts, tone, max turns
 *   6. Background docs      — pasted text + external URLs (file upload pending S3)
 *   7. Content stub         — summary text, resource links
 *
 * Saving creates a new version (AUT-09). "Preview check-in questions" sends
 * the unsaved draft to the backend (AUT-08).
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { adminApi } from '../../services/api';
import type { ContentBlock, InstructionalBlock, SapBlock, ConceptualBlock, ActivityStep } from '@cap/shared';

// ── style shorthands (matching the scaffold's inline-style look) ──────────────
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' };
const lbl: React.CSSProperties   = { fontWeight: 600, fontSize: 13, color: '#333', display: 'block', marginBottom: 4 };
const smallBtn: React.CSSProperties = { padding: '4px 10px', fontSize: 12, border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer' };
const addBtn: React.CSSProperties   = { ...smallBtn, color: '#1D4E8C', borderColor: '#1D4E8C' };

function uid() { return Math.random().toString(36).slice(2, 10); }

interface Draft {
  recipeId?: string; version?: number;
  moduleId: string; moduleTitle: string; moduleDescription: string;
  learningOutcomes: string[];
  keyConcepts: { term: string; definition: string }[];
  contentBlocks: ContentBlock[];
  pairings: Record<string, string>;          // instructionalBlockId → sapBlockId
  rubricDimensions: { name: string; description: string }[];
  probingRules: { trigger: string; followUp: string }[];
  vagueAnswerTriggers: string[];
  careerTransferPrompts: string[];
  toneGuidance: string;
  maxTurns: number;
  pastedDoc: string;
  docLinks: { url: string; label: string }[];
  summaryText: string;
  resourceLinks: { url: string; label: string; type: 'reading' | 'video' | 'tool' }[];
}

const EMPTY: Draft = {
  moduleId: '', moduleTitle: '', moduleDescription: '',
  learningOutcomes: ['', ''],
  keyConcepts: [{ term: '', definition: '' }],
  contentBlocks: [], pairings: {},
  rubricDimensions: [{ name: '', description: '' }],
  probingRules: [], vagueAnswerTriggers: [], careerTransferPrompts: [],
  toneGuidance: '', maxTurns: 20,
  pastedDoc: '', docLinks: [], summaryText: '', resourceLinks: [],
};

function fromRecipe(r: any): Draft {
  const pairings: Record<string, string> = {};
  for (const p of r.concurrentPairs ?? []) pairings[p.instructionalId] = p.sapId;
  const docs = r.backgroundDocs ?? [];
  return {
    ...EMPTY, ...r,
    pairings,
    pastedDoc:      docs.find((d: any) => d.type === 'text')?.content ?? '',
    docLinks:       docs.filter((d: any) => d.type === 'link').map((d: any) => ({ url: d.content, label: d.label ?? d.content })),
    summaryText:    r.contentStub?.summaryText ?? '',
    resourceLinks:  r.contentStub?.resourceLinks ?? [],
  };
}

/** Rebuild sequence + concurrentPairs from block order + pairings. */
function compileSequence(d: Draft) {
  const pairs: { pairId: string; instructionalId: string; sapId: string }[] = [];
  const pairOfBlock = new Map<string, string>(); // blockId → pairId
  for (const [instrId, sapId] of Object.entries(d.pairings)) {
    if (!sapId) continue;
    const pairId = `pair-${instrId}`;
    pairs.push({ pairId, instructionalId: instrId, sapId });
    pairOfBlock.set(instrId, pairId);
    pairOfBlock.set(sapId, pairId);
  }
  const emitted = new Set<string>();
  const sequence = [];
  for (const b of d.contentBlocks) {
    const pairId = pairOfBlock.get(b.blockId);
    if (pairId) {
      if (!emitted.has(pairId)) { sequence.push({ kind: 'pair' as const, pairId }); emitted.add(pairId); }
    } else {
      sequence.push({ kind: 'block' as const, blockId: b.blockId });
    }
  }
  return { concurrentPairs: pairs, sequence };
}

// ── tiny list helpers ─────────────────────────────────────────────────────────
function ListEditor({ items, renderItem, onAdd, addLabel }: {
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

function Move({ onUp, onDown, onDel, first, last }: {
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

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir; if (j < 0 || j >= arr.length) return arr;
  const c = [...arr]; [c[i], c[j]] = [c[j], c[i]]; return c;
}

// ── page ──────────────────────────────────────────────────────────────────────
export function RecipeFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const [d, setD] = useState<Draft>(EMPTY);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState<{ version: number; updatedAt: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<any[] | 'loading' | null>(null);

  useEffect(() => {
    if (!id) return;
    adminApi.recipe.get(id).then((r: any) => setD(fromRecipe(r))).catch(e => setLoadErr(e.message));
  }, [id]);

  const set = (patch: Partial<Draft>) => { setD(prev => ({ ...prev, ...patch })); setSaved(null); };
  const setItem = (field: keyof Draft, i: number, patch: any) =>
    set({ [field]: (d[field] as any[]).map((x, j) => j === i ? { ...x, ...patch } : x) } as any);

  const sapBlocks  = d.contentBlocks.filter(b => b.type === 'sap') as SapBlock[];
  const instrBlocks = d.contentBlocks.filter(b => b.type === 'instructional') as InstructionalBlock[];

  // Outcome coverage: which LO indices have ≥1 tagged step (AUT-04/05)
  const covered = new Set<number>();
  for (const b of instrBlocks) for (const s of b.steps) for (const i of s.outcomeTagIndices) covered.add(i);
  const untaggedSteps = instrBlocks.reduce((n, b) => n + b.steps.filter(s => !s.outcomeTagIndices.length).length, 0);

  function validate(): string[] {
    const errs: string[] = [];
    if (!d.moduleId.trim())          errs.push('Module ID is required.');
    if (!d.moduleTitle.trim())       errs.push('Module title is required.');
    if (!d.moduleDescription.trim()) errs.push('Module description is required.');
    if (d.learningOutcomes.filter(o => o.trim()).length < 2) errs.push('At least 2 learning outcomes are required.');
    if (!d.rubricDimensions.some(x => x.name.trim())) errs.push('At least one rubric dimension is required.');
    for (const b of instrBlocks) for (const s of b.steps)
      if (!s.description.trim()) errs.push(`Step ${s.stepNumber} in "${b.title || 'untitled block'}" needs a description.`);
    return errs;
  }

  function toRecipe() {
    const { concurrentPairs, sequence } = compileSequence(d);
    return {
      ...(d.recipeId ? { recipeId: d.recipeId } : {}),
      moduleId: d.moduleId.trim(), moduleTitle: d.moduleTitle.trim(),
      moduleDescription: d.moduleDescription.trim(),
      learningOutcomes: d.learningOutcomes.map(o => o.trim()).filter(Boolean),
      keyConcepts: d.keyConcepts.filter(c => c.term.trim()),
      contentBlocks: d.contentBlocks,
      concurrentPairs, sequence,
      rubricDimensions: d.rubricDimensions.filter(x => x.name.trim()),
      probingRules: d.probingRules.filter(p => p.trigger.trim()),
      vagueAnswerTriggers: d.vagueAnswerTriggers.filter(Boolean),
      careerTransferPrompts: d.careerTransferPrompts.filter(Boolean),
      toneGuidance: d.toneGuidance || undefined,
      maxTurns: d.maxTurns,
      backgroundDocs: [
        ...(d.pastedDoc.trim() ? [{ type: 'text' as const, content: d.pastedDoc.trim(), label: 'Pasted documentation' }] : []),
        ...d.docLinks.filter(l => l.url.trim()).map(l => ({ type: 'link' as const, content: l.url.trim(), label: l.label.trim() || l.url.trim() })),
      ],
      contentStub: d.summaryText.trim()
        ? { summaryText: d.summaryText.trim(), resourceLinks: d.resourceLinks.filter(l => l.url.trim()) }
        : undefined,
    };
  }

  async function save() {
    const errs = validate();
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      const savedRecipe = await adminApi.recipe.save(toRecipe());
      setD(fromRecipe(savedRecipe));
      setSaved({ version: savedRecipe.version, updatedAt: savedRecipe.updatedAt });
      window.scrollTo(0, 0);
    } catch (e: any) { setErrors([e.message]); }
    finally { setSaving(false); }
  }

  async function previewCheckin() {
    setPreview('loading');
    try {
      const r = await adminApi.recipe.previewCheckin(d.moduleId || 'draft', toRecipe());
      setPreview(r.questions);
    } catch (e: any) { setPreview([]); setErrors([`Preview failed: ${e.message}`]); }
  }

  function setBlock(i: number, patch: Partial<ContentBlock>) {
    const blocks = [...d.contentBlocks];
    blocks[i] = { ...blocks[i], ...patch } as ContentBlock;
    set({ contentBlocks: blocks });
  }
  function addBlock(type: ContentBlock['type']) {
    const base = { blockId: `cb-${uid()}`, isGate: type === 'sap' };
    const block: ContentBlock = type === 'conceptual'
      ? { ...base, type, title: '', body: '', isGate: false } as ConceptualBlock
      : type === 'instructional'
        ? { ...base, type, title: '', steps: [] } as InstructionalBlock
        : { ...base, type, title: '', taskPrompt: '', isGate: true } as SapBlock;
    set({ contentBlocks: [...d.contentBlocks, block] });
  }

  if (loadErr) return <p style={{ color: '#a33' }}>Could not load recipe: {loadErr}</p>;

  return (
    <div style={{ maxWidth: 780 }}>
      <h2 style={{ color: '#1D4E8C', marginBottom: 4 }}>
        {isNew ? 'New recipe' : `Edit recipe — ${d.moduleTitle || id}`}
        {d.version ? <span style={{ fontSize: 14, color: '#888', fontWeight: 400 }}> (editing v{d.version} — save creates v{d.version + 1})</span> : null}
      </h2>
      <p style={{ color: '#888', marginBottom: 24, fontSize: 14 }}>
        Sections marked ★ are required. <Link to="/author/recipes" style={{ color: '#1D4E8C' }}>← Back to list</Link>
      </p>

      {saved && (
        <div style={{ background: '#e6f4ea', border: '1px solid #c2e2cb', color: '#1e6b34',
          padding: '12px 16px', borderRadius: 6, marginBottom: 16 }}>
          Saved as <strong>version {saved.version}</strong> at {new Date(saved.updatedAt).toLocaleString()}.
          New student sessions will use this version.
        </div>
      )}
      {!!errors.length && (
        <div style={{ background: '#fbeaea', border: '1px solid #eec9c9', color: '#7a1f1f',
          padding: '12px 16px', borderRadius: 6, marginBottom: 16 }}>
          {errors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}

      {/* ── 1. Module identity ─────────────────────────────────────────── */}
      <Section title="★ 1. Module identity">
        <label style={lbl}>Module ID</label>
        <input style={input} placeholder="e.g. sap-sales-process" value={d.moduleId}
          onChange={e => set({ moduleId: e.target.value })} />
        <div style={{ fontSize: 12, color: '#888', margin: '4px 0 14px' }}>
          Matches the module identifier used at launch (Canvas resource link in production).
        </div>
        <label style={lbl}>Module title</label>
        <input style={input} value={d.moduleTitle} onChange={e => set({ moduleTitle: e.target.value })} />
        <div style={{ height: 12 }} />
        <label style={lbl}>Module description</label>
        <textarea style={{ ...input, minHeight: 70 }} value={d.moduleDescription}
          onChange={e => set({ moduleDescription: e.target.value })} />
      </Section>

      {/* ── 2. Learning outcomes ───────────────────────────────────────── */}
      <Section title="★ 2. Learning outcomes">
        <ListEditor items={d.learningOutcomes} addLabel="Add outcome"
          onAdd={() => set({ learningOutcomes: [...d.learningOutcomes, ''] })}
          renderItem={(o, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <span style={{ minWidth: 34, fontSize: 13, color: '#666' }}>LO{i + 1}</span>
              <input style={input} value={o} onChange={e =>
                set({ learningOutcomes: d.learningOutcomes.map((x, j) => j === i ? e.target.value : x) })} />
              <Move first={i === 0} last={i === d.learningOutcomes.length - 1}
                onUp={() => set({ learningOutcomes: move(d.learningOutcomes, i, -1) })}
                onDown={() => set({ learningOutcomes: move(d.learningOutcomes, i, 1) })}
                onDel={() => set({ learningOutcomes: d.learningOutcomes.filter((_, j) => j !== i) })} />
            </div>
          )} />
        <CoverageNote covered={covered} total={d.learningOutcomes.filter(o => o.trim()).length} untagged={untaggedSteps} />
      </Section>

      {/* ── 3. Key concepts ────────────────────────────────────────────── */}
      <Section title="★ 3. Key concepts">
        <ListEditor items={d.keyConcepts} addLabel="Add concept"
          onAdd={() => set({ keyConcepts: [...d.keyConcepts, { term: '', definition: '' }] })}
          renderItem={(c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input style={{ ...input, flex: 1 }} placeholder="Term" value={c.term}
                onChange={e => setItem('keyConcepts', i, { term: e.target.value })} />
              <input style={{ ...input, flex: 2 }} placeholder="Definition" value={c.definition}
                onChange={e => setItem('keyConcepts', i, { definition: e.target.value })} />
              <Move first={i === 0} last={i === d.keyConcepts.length - 1}
                onUp={() => set({ keyConcepts: move(d.keyConcepts, i, -1) })}
                onDown={() => set({ keyConcepts: move(d.keyConcepts, i, 1) })}
                onDel={() => set({ keyConcepts: d.keyConcepts.filter((_, j) => j !== i) })} />
            </div>
          )} />
      </Section>

      {/* ── 4. Content blocks ──────────────────────────────────────────── */}
      <Section title="★ 4. Content blocks">
        <p style={{ fontSize: 12, color: '#777', marginTop: 0 }}>
          Blocks display to the student in order. <strong>Gate</strong> blocks must be completed
          before the next unlocks — SAP blocks are always gates. Pair an instructional block
          with a SAP block to show them side by side.
        </p>
        {d.contentBlocks.map((b, i) => (
          <div key={b.blockId} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#1D4E8C' }}>
                {b.type} block {b.isGate ? '· 🔒 gate' : ''}
              </span>
              <Move first={i === 0} last={i === d.contentBlocks.length - 1}
                onUp={() => set({ contentBlocks: move(d.contentBlocks, i, -1) })}
                onDown={() => set({ contentBlocks: move(d.contentBlocks, i, 1) })}
                onDel={() => {
                  const pairings = { ...d.pairings };
                  delete pairings[b.blockId];
                  for (const k of Object.keys(pairings)) if (pairings[k] === b.blockId) delete pairings[k];
                  set({ contentBlocks: d.contentBlocks.filter((_, j) => j !== i), pairings });
                }} />
            </div>
            <input style={{ ...input, marginBottom: 8 }} placeholder="Block title" value={b.title}
              onChange={e => setBlock(i, { title: e.target.value })} />

            {b.type === 'conceptual' && (
              <>
                <textarea style={{ ...input, minHeight: 90 }} placeholder="Body (markdown supported)" value={(b as ConceptualBlock).body}
                  onChange={e => setBlock(i, { body: e.target.value } as any)} />
                <input style={{ ...input, marginTop: 8 }} placeholder="Video URL (optional, < 5 min)" value={(b as ConceptualBlock).videoUrl ?? ''}
                  onChange={e => setBlock(i, { videoUrl: e.target.value } as any)} />
              </>
            )}

            {b.type === 'instructional' && (
              <StepEditor block={b as InstructionalBlock} outcomes={d.learningOutcomes}
                onChange={steps => setBlock(i, { steps } as any)} />
            )}

            {b.type === 'sap' && (
              <textarea style={{ ...input, minHeight: 70 }} placeholder="Task prompt — what the student does in SAP"
                value={(b as SapBlock).taskPrompt} onChange={e => setBlock(i, { taskPrompt: e.target.value } as any)} />
            )}

            {b.type !== 'sap' && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginTop: 8 }}>
                <input type="checkbox" checked={b.isGate}
                  onChange={e => setBlock(i, { isGate: e.target.checked })} />
                Gate — student must complete before continuing
              </label>
            )}

            {b.type === 'instructional' && sapBlocks.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <label style={lbl}>Concurrent pair with SAP block (side-by-side view)</label>
                <select style={{ ...input, width: 'auto' }} value={d.pairings[b.blockId] ?? ''}
                  onChange={e => set({ pairings: { ...d.pairings, [b.blockId]: e.target.value } })}>
                  <option value="">— none —</option>
                  {sapBlocks.map(sb => (
                    <option key={sb.blockId} value={sb.blockId}>{sb.title || sb.blockId}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={addBtn} onClick={() => addBlock('conceptual')}>+ Conceptual</button>
          <button type="button" style={addBtn} onClick={() => addBlock('instructional')}>+ Instructional</button>
          <button type="button" style={addBtn} onClick={() => addBlock('sap')}>+ SAP activity</button>
        </div>
      </Section>

      {/* ── 5. Instructional recipe ────────────────────────────────────── */}
      <Section title="★ 5. Instructional recipe">
        <label style={lbl}>Rubric dimensions (name + what to assess)</label>
        <ListEditor items={d.rubricDimensions} addLabel="Add dimension"
          onAdd={() => set({ rubricDimensions: [...d.rubricDimensions, { name: '', description: '' }] })}
          renderItem={(x, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input style={{ ...input, flex: 1 }} placeholder="Name" value={x.name}
                onChange={e => setItem('rubricDimensions', i, { name: e.target.value })} />
              <input style={{ ...input, flex: 2 }} placeholder="What good looks like" value={x.description}
                onChange={e => setItem('rubricDimensions', i, { description: e.target.value })} />
              <Move first={i === 0} last={i === d.rubricDimensions.length - 1}
                onUp={() => set({ rubricDimensions: move(d.rubricDimensions, i, -1) })}
                onDown={() => set({ rubricDimensions: move(d.rubricDimensions, i, 1) })}
                onDel={() => set({ rubricDimensions: d.rubricDimensions.filter((_, j) => j !== i) })} />
            </div>
          )} />

        <div style={{ height: 16 }} />
        <label style={lbl}>Probing rules — IF trigger / THEN follow-up (max 10)</label>
        <p style={{ fontSize: 12, color: '#777', marginTop: 0 }}>
          e.g. IF "student names a transaction code without the business outcome" THEN "ask what the business achieves with that document".
        </p>
        <ListEditor items={d.probingRules} addLabel="Add rule"
          onAdd={() => d.probingRules.length < 10 && set({ probingRules: [...d.probingRules, { trigger: '', followUp: '' }] })}
          renderItem={(p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input style={{ ...input, flex: 1 }} placeholder="IF: trigger pattern" value={p.trigger}
                onChange={e => setItem('probingRules', i, { trigger: e.target.value })} />
              <input style={{ ...input, flex: 1 }} placeholder="THEN: follow-up" value={p.followUp}
                onChange={e => setItem('probingRules', i, { followUp: e.target.value })} />
              <Move first={i === 0} last={i === d.probingRules.length - 1}
                onUp={() => set({ probingRules: move(d.probingRules, i, -1) })}
                onDown={() => set({ probingRules: move(d.probingRules, i, 1) })}
                onDel={() => set({ probingRules: d.probingRules.filter((_, j) => j !== i) })} />
            </div>
          )} />

        <div style={{ height: 16 }} />
        <label style={lbl}>Vague answer triggers (one per line)</label>
        <textarea style={{ ...input, minHeight: 60 }} value={d.vagueAnswerTriggers.join('\n')}
          onChange={e => set({ vagueAnswerTriggers: e.target.value.split('\n') })}
          placeholder={'Student describes a step without explaining its purpose.'} />

        <div style={{ height: 16 }} />
        <label style={lbl}>Career transfer prompts (1–3, used near the end)</label>
        <ListEditor items={d.careerTransferPrompts} addLabel="Add prompt"
          onAdd={() => d.careerTransferPrompts.length < 3 && set({ careerTransferPrompts: [...d.careerTransferPrompts, ''] })}
          renderItem={(p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input style={input} value={p} onChange={e =>
                set({ careerTransferPrompts: d.careerTransferPrompts.map((x, j) => j === i ? e.target.value : x) })} />
              <Move first={i === 0} last={i === d.careerTransferPrompts.length - 1}
                onUp={() => set({ careerTransferPrompts: move(d.careerTransferPrompts, i, -1) })}
                onDown={() => set({ careerTransferPrompts: move(d.careerTransferPrompts, i, 1) })}
                onDel={() => set({ careerTransferPrompts: d.careerTransferPrompts.filter((_, j) => j !== i) })} />
            </div>
          )} />

        <div style={{ height: 16 }} />
        <label style={lbl}>Tone guidance (optional)</label>
        <textarea style={{ ...input, minHeight: 50 }} value={d.toneGuidance}
          onChange={e => set({ toneGuidance: e.target.value })}
          placeholder="e.g. Most students have no prior ERP experience — be patient and scaffolding." />

        <div style={{ height: 16 }} />
        <label style={lbl}>Max conversation turns</label>
        <input type="number" min={4} max={40} style={{ ...input, width: 90 }} value={d.maxTurns}
          onChange={e => set({ maxTurns: parseInt(e.target.value) || 20 })} />
      </Section>

      {/* ── 6. Background documentation ────────────────────────────────── */}
      <Section title="6. Background documentation">
        <p style={{ fontSize: 12, color: '#777', marginTop: 0 }}>
          Grounds the agent's probing in real module content. File upload (PDF/DOCX → S3) is
          pending infrastructure — pasted text and links work now.
        </p>
        <label style={lbl}>Pasted text (max 10,000 chars)</label>
        <textarea style={{ ...input, minHeight: 90 }} maxLength={10000} value={d.pastedDoc}
          onChange={e => set({ pastedDoc: e.target.value })} />
        <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>{d.pastedDoc.length}/10,000</div>
        <label style={lbl}>External links</label>
        <ListEditor items={d.docLinks} addLabel="Add link"
          onAdd={() => set({ docLinks: [...d.docLinks, { url: '', label: '' }] })}
          renderItem={(l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input style={{ ...input, flex: 1 }} placeholder="Label" value={l.label}
                onChange={e => setItem('docLinks', i, { label: e.target.value })} />
              <input style={{ ...input, flex: 2 }} placeholder="https://…" value={l.url}
                onChange={e => setItem('docLinks', i, { url: e.target.value })} />
              <Move first={i === 0} last={i === d.docLinks.length - 1}
                onUp={() => set({ docLinks: move(d.docLinks, i, -1) })}
                onDown={() => set({ docLinks: move(d.docLinks, i, 1) })}
                onDel={() => set({ docLinks: d.docLinks.filter((_, j) => j !== i) })} />
            </div>
          )} />
      </Section>

      {/* ── 7. Content stub ────────────────────────────────────────────── */}
      <Section title="7. Content stub">
        <label style={lbl}>Summary text (shown to the student before the activity)</label>
        <textarea style={{ ...input, minHeight: 70 }} value={d.summaryText}
          onChange={e => set({ summaryText: e.target.value })} />
        <div style={{ height: 12 }} />
        <label style={lbl}>Resource links</label>
        <ListEditor items={d.resourceLinks} addLabel="Add resource"
          onAdd={() => set({ resourceLinks: [...d.resourceLinks, { url: '', label: '', type: 'reading' }] })}
          renderItem={(l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input style={{ ...input, flex: 1.2 }} placeholder="Label" value={l.label}
                onChange={e => setItem('resourceLinks', i, { label: e.target.value })} />
              <input style={{ ...input, flex: 2 }} placeholder="https://…" value={l.url}
                onChange={e => setItem('resourceLinks', i, { url: e.target.value })} />
              <select style={{ ...input, width: 100 }} value={l.type}
                onChange={e => setItem('resourceLinks', i, { type: e.target.value })}>
                <option value="reading">reading</option>
                <option value="video">video</option>
                <option value="tool">tool</option>
              </select>
              <Move first={i === 0} last={i === d.resourceLinks.length - 1}
                onUp={() => set({ resourceLinks: move(d.resourceLinks, i, -1) })}
                onDown={() => set({ resourceLinks: move(d.resourceLinks, i, 1) })}
                onDel={() => set({ resourceLinks: d.resourceLinks.filter((_, j) => j !== i) })} />
            </div>
          )} />
      </Section>

      {/* ── actions ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginTop: 24, marginBottom: 60 }}>
        <button onClick={save} disabled={saving}
          style={{ background: '#1D4E8C', color: '#fff', border: 'none',
            borderRadius: 4, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save recipe'}
        </button>
        <button onClick={previewCheckin}
          style={{ background: '#E6F4F1', color: '#085041', border: 'none',
            borderRadius: 4, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}>
          Preview check-in questions
        </button>
      </div>

      {preview !== null && (
        <div style={{ border: '1px solid #b7d4c9', borderRadius: 6, padding: 16,
          background: '#f6fbf9', marginBottom: 60 }}>
          <h3 style={{ marginTop: 0, color: '#085041', fontSize: 15 }}>
            Sample check-in questions
            <span style={{ fontWeight: 400, fontSize: 12, color: '#666' }}> — generated from the current draft; actual questions vary per session</span>
          </h3>
          {preview === 'loading' && <p style={{ color: '#888' }}>Generating…</p>}
          {Array.isArray(preview) && preview.map((q: any, i: number) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{q.questionText}</div>
              <div style={{ fontSize: 12, color: '#666' }}>
                {q.responseType}{q.options ? ` — ${q.options.length} options` : ''}
              </div>
            </div>
          ))}
          <button style={smallBtn} onClick={() => setPreview(null)}>Close preview</button>
        </div>
      )}
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ background: '#EEF3FA', padding: '12px 16px', fontWeight: 600, fontSize: 14, color: '#1D4E8C' }}>
        {title}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function CoverageNote({ covered, total, untagged }: { covered: Set<number>; total: number; untagged: number }) {
  if (!total) return null;
  const missing = [...Array(total).keys()].filter(i => !covered.has(i));
  return (
    <div style={{ marginTop: 10, fontSize: 12, color: '#666', background: '#f7f9fc',
      padding: '8px 12px', borderRadius: 4 }}>
      Step coverage: {total - missing.length}/{total} outcomes have at least one tagged step.
      {missing.length > 0 && <span style={{ color: '#8a6d00' }}> Untagged: {missing.map(i => `LO${i + 1}`).join(', ')}.</span>}
      {untagged > 0 && <span style={{ color: '#8a6d00' }}> {untagged} context-only step{untagged === 1 ? '' : 's'} (no outcome tag — the AI infers mapping at session start).</span>}
    </div>
  );
}

function StepEditor({ block, outcomes, onChange }: {
  block: InstructionalBlock; outcomes: string[]; onChange: (steps: ActivityStep[]) => void;
}) {
  const steps = block.steps;
  const setStep = (i: number, patch: Partial<ActivityStep>) =>
    onChange(steps.map((s, j) => j === i ? { ...s, ...patch } : s)
      .map((s, j) => ({ ...s, stepNumber: j + 1 })));
  const del = (i: number) =>
    onChange(steps.filter((_, j) => j !== i).map((s, j) => ({ ...s, stepNumber: j + 1 })));
  const reorder = (i: number, dir: -1 | 1) =>
    onChange(move(steps, i, dir).map((s, j) => ({ ...s, stepNumber: j + 1 })));
  const toggleOutcome = (i: number, oi: number) => {
    const cur = new Set(steps[i].outcomeTagIndices);
    cur.has(oi) ? cur.delete(oi) : cur.add(oi);
    setStep(i, { outcomeTagIndices: [...cur].sort() });
  };

  return (
    <div style={{ background: '#f7f9fc', borderRadius: 4, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8 }}>
        Activity steps — tagged steps are probe-eligible; untagged are context-only
      </div>
      {steps.map((s, i) => (
        <div key={i} style={{ marginBottom: 12, padding: 10, background: '#fff',
          border: '1px solid #e2e8f0', borderRadius: 4,
          borderLeft: `3px solid ${s.outcomeTagIndices.length ? '#1D4E8C' : '#ccc'}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ minWidth: 24, fontWeight: 700, color: '#1D4E8C', fontSize: 13, paddingTop: 8 }}>
              {s.stepNumber}.
            </span>
            <div style={{ flex: 1 }}>
              <input style={input} placeholder="Step description (required)" value={s.description}
                onChange={e => setStep(i, { description: e.target.value })} />
              <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', fontSize: 12 }}>
                {outcomes.map((o, oi) => o.trim() && (
                  <label key={oi} style={{ display: 'flex', gap: 4, alignItems: 'center', color: '#444' }}>
                    <input type="checkbox" checked={s.outcomeTagIndices.includes(oi)}
                      onChange={() => toggleOutcome(i, oi)} />
                    LO{oi + 1}
                  </label>
                ))}
                {!s.outcomeTagIndices.length && <span style={{ color: '#999' }}>context-only</span>}
              </div>
              <input style={{ ...input, marginTop: 6, fontSize: 13 }} value={s.understandingNote}
                placeholder="Understanding note (optional) — what good understanding looks like"
                onChange={e => setStep(i, { understandingNote: e.target.value })} />
            </div>
            <Move first={i === 0} last={i === steps.length - 1}
              onUp={() => reorder(i, -1)} onDown={() => reorder(i, 1)} onDel={() => del(i)} />
          </div>
        </div>
      ))}
      <button type="button" style={addBtn}
        onClick={() => onChange([...steps, { stepNumber: steps.length + 1, description: '', outcomeTagIndices: [], understandingNote: '' }])}>
        + Add step
      </button>
    </div>
  );
}
