/**
 * sections.tsx — The five wizard section screens (v3).
 *
 * Each section edits a slice of the draft's recipe data. Props:
 *   draft    — the live RecipeDraft (sections + data + aiFields)
 *   setData  — merge a patch into draft.data (autosaves)
 *   imageUpload — Quill image handler bound to this draft's moduleId
 *
 * Section order matches AUTHORING_SECTIONS in @cap/shared. The Review &
 * publish screen lives here too — it's the wizard's final step.
 */
import { useState } from 'react';
import { adminApi } from '../../services/api';
import {
  input, lbl, addBtn, smallBtn, move, Move, ListEditor,
  newStep, newBlock, bodyText, BLOCK_LABELS, BlockEditor,
  AiBadge, HelpBlock,
} from '../../components/authoring/editors';
import type { RecipeDraft, ModuleStep, ContentBlock, Recipe } from '@cap/shared';

export interface SectionProps {
  draft:    RecipeDraft;
  setData:  (patch: Partial<Recipe>) => void;
  imageUpload: () => void;
}

type Data = Partial<Recipe>;

const setItem = (data: Data, setData: SectionProps['setData'], field: keyof Recipe, i: number, patch: any) =>
  setData({ [field]: ((data[field] as any[]) ?? []).map((x, j) => j === i ? { ...x, ...patch } : x) } as any);

// ── 1. Module basics ──────────────────────────────────────────────────────────
export function BasicsSection({ draft, setData }: SectionProps) {
  const d = draft.data;
  const ai = (f: string) => draft.aiFields.includes(f);
  return (
    <div>
      <HelpBlock
        what="Names the module for students and links it to the course. The Module ID must match the identifier used at launch (the Canvas resource link in production — use lowercase-with-dashes)."
        example="sap-sales-process" />
      <label style={lbl}>Module ID</label>
      <input style={input} placeholder="e.g. sap-sales-process" value={draft.moduleId ?? d.moduleId ?? ''}
        onChange={e => setData({ moduleId: e.target.value })} />
      <div style={{ height: 12 }} />
      <label style={lbl}>Module title <AiBadge show={ai('moduleTitle')} /></label>
      <input style={input} value={d.moduleTitle ?? ''} onChange={e => setData({ moduleTitle: e.target.value })} />
      <div style={{ height: 12 }} />
      <label style={lbl}>Module description <AiBadge show={ai('moduleDescription')} /></label>
      <textarea style={{ ...input, minHeight: 70 }} value={d.moduleDescription ?? ''}
        placeholder="What the student does and why it matters — shown in the module intro."
        onChange={e => setData({ moduleDescription: e.target.value })} />
    </div>
  );
}

// ── 2. Learning outcomes ──────────────────────────────────────────────────────
export function OutcomesSection({ draft, setData }: SectionProps) {
  const d = draft.data;
  const outcomes = d.learningOutcomes ?? [];
  const steps    = d.steps ?? [];
  const ai = draft.aiFields.includes('learningOutcomes');

  const covered = new Set<number>();
  for (const s of steps) for (const i of s.outcomeTagIndices) covered.add(i);
  const total = outcomes.filter(o => o.trim()).length;
  const missing = [...Array(total).keys()].filter(i => !covered.has(i));
  const untaggedSteps = steps.filter(s => !s.outcomeTagIndices.length).length;

  return (
    <div>
      <HelpBlock
        what="What students should be able to do or explain after this module (at least 2). In the checkout conversation, the AI probes for evidence of these outcomes — so write them as things a student could demonstrate in words."
        example="Explain how a sales order carries data forward from earlier documents." />
      <label style={lbl}>Learning outcomes <AiBadge show={ai} /></label>
      <ListEditor items={outcomes.length ? outcomes : ['', '']} addLabel="Add outcome"
        onAdd={() => setData({ learningOutcomes: [...outcomes, ''] })}
        renderItem={(o: string, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <span style={{ minWidth: 34, fontSize: 13, color: '#666' }}>LO{i + 1}</span>
            <input style={input} value={o} onChange={e =>
              setData({ learningOutcomes: outcomes.map((x, j) => j === i ? e.target.value : x) })} />
            <Move first={i === 0} last={i === outcomes.length - 1}
              onUp={() => setData({ learningOutcomes: move(outcomes, i, -1) })}
              onDown={() => setData({ learningOutcomes: move(outcomes, i, 1) })}
              onDel={() => setData({ learningOutcomes: outcomes.filter((_, j) => j !== i) })} />
          </div>
        )} />
      {total > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#666', background: '#f7f9fc',
          padding: '8px 12px', borderRadius: 4 }}>
          Step coverage: {total - missing.length}/{total} outcomes have at least one tagged step.
          {missing.length > 0 && <span style={{ color: '#8a6d00' }}> Untagged: {missing.map(i => `LO${i + 1}`).join(', ')}.</span>}
          {untaggedSteps > 0 && <span style={{ color: '#8a6d00' }}> {untaggedSteps} context-only step{untaggedSteps === 1 ? '' : 's'}.</span>}
        </div>
      )}
    </div>
  );
}

// ── 3. Key concepts ───────────────────────────────────────────────────────────
export function ConceptsSection({ draft, setData }: SectionProps) {
  const d = draft.data;
  const concepts = d.keyConcepts ?? [];
  const ai = draft.aiFields.includes('keyConcepts');
  return (
    <div>
      <HelpBlock
        what="The terms a novice would trip on — the AI uses these to calibrate its vocabulary during the debrief (and they feed check-in question generation). Write definitions in plain language."
        example="Document flow — the linked chain of documents that carries data forward automatically." />
      <label style={lbl}>Key concepts <AiBadge show={ai} /></label>
      <ListEditor items={concepts.length ? concepts : [{ term: '', definition: '' }]} addLabel="Add concept"
        onAdd={() => setData({ keyConcepts: [...concepts, { term: '', definition: '' }] })}
        renderItem={(c: { term: string; definition: string }, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input style={{ ...input, flex: 1 }} placeholder="Term" value={c.term}
              onChange={e => setItem(d, setData, 'keyConcepts', i, { term: e.target.value })} />
            <input style={{ ...input, flex: 2 }} placeholder="Definition" value={c.definition}
              onChange={e => setItem(d, setData, 'keyConcepts', i, { definition: e.target.value })} />
            <Move first={i === 0} last={i === concepts.length - 1}
              onUp={() => setData({ keyConcepts: move(concepts, i, -1) })}
              onDown={() => setData({ keyConcepts: move(concepts, i, 1) })}
              onDel={() => setData({ keyConcepts: concepts.filter((_, j) => j !== i) })} />
          </div>
        )} />
    </div>
  );
}

// ── 4. Activity steps ─────────────────────────────────────────────────────────
export function ActivitySection({ draft, setData, imageUpload }: SectionProps) {
  const d = draft.data;
  const steps      = d.steps ?? [];
  const parameters = d.parameters ?? [];
  const outcomes   = d.learningOutcomes ?? [];

  const setStep  = (i: number, patch: Partial<ModuleStep>) =>
    setData({ steps: steps.map((s, j) => j === i ? { ...s, ...patch } : s) });
  const addStep  = () => setData({ steps: [...steps, newStep(steps.length + 1)] });
  const delStep  = (i: number) =>
    setData({ steps: steps.filter((_, j) => j !== i).map((s, j) => ({ ...s, stepNumber: j + 1 })) });
  const moveStep = (i: number, dir: -1 | 1) =>
    setData({ steps: move(steps, i, dir).map((s, j) => ({ ...s, stepNumber: j + 1 })) });

  return (
    <div>
      <HelpBlock
        what="The hands-on activity, as a sequence of steps — each step is one wizard screen for the student. Steps tagged to learning outcomes (with an understanding note) are what the AI probes on afterwards. You build these yourself — the AI only drafts the conversation side."
        example="Step: Create the inquiry → guided tool block with the SAP instructions." />

      <div style={{ border: '1px solid #dfe7e0', borderRadius: 6, padding: 12, marginBottom: 12, background: '#f4faf6' }}>
        <label style={lbl}>Module parameters (optional)</label>
        <p style={{ fontSize: 12, color: '#777', marginTop: 0 }}>
          Keys used as <code>{'{key}'}</code> placeholders in guided-tool instructions.
          Each student's values come from the parameter table row for their assigned
          tool account — e.g. key <code>orderQty</code> renders as <code>50</code> for one
          student and <code>75</code> for another.
        </p>
        <ListEditor items={parameters} addLabel="Add parameter"
          onAdd={() => setData({ parameters: [...parameters, { key: '', label: '' }] })}
          renderItem={(p: { key: string; label: string }, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input style={{ ...input, flex: 1 }} placeholder="key (e.g. orderQty)" value={p.key}
                onChange={e => setItem(d, setData, 'parameters', i, { key: e.target.value })} />
              <input style={{ ...input, flex: 2 }} placeholder="Label (e.g. Order quantity)" value={p.label}
                onChange={e => setItem(d, setData, 'parameters', i, { label: e.target.value })} />
              <Move first={i === 0} last={i === parameters.length - 1}
                onUp={() => setData({ parameters: move(parameters, i, -1) })}
                onDown={() => setData({ parameters: move(parameters, i, 1) })}
                onDel={() => setData({ parameters: parameters.filter((_, j) => j !== i) })} />
            </div>
          )} />
      </div>

      {steps.map((s, i) => (
        <div key={s.stepId} style={{ border: '1px solid #cdd7e4', borderRadius: 6, padding: 14, marginBottom: 12, background: '#fbfcfe' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e6b34' }}>
              Step {s.stepNumber}
              {!s.outcomeTagIndices.length && <span style={{ color: '#999', fontWeight: 400 }}> · context-only</span>}
            </span>
            <Move first={i === 0} last={i === steps.length - 1}
              onUp={() => moveStep(i, -1)} onDown={() => moveStep(i, 1)} onDel={() => delStep(i)} />
          </div>

          <input style={{ ...input, marginBottom: 8 }} placeholder="Step title (required)" value={s.title}
            onChange={e => setStep(i, { title: e.target.value })} />
          <textarea style={{ ...input, minHeight: 50 }} placeholder="What the student does (required — the AI probes on this)" value={s.description}
            onChange={e => setStep(i, { description: e.target.value })} />

          <div style={{ display: 'flex', gap: 10, margin: '8px 0', flexWrap: 'wrap', fontSize: 12 }}>
            {outcomes.map((o, oi) => o.trim() && (
              <label key={oi} style={{ display: 'flex', gap: 4, alignItems: 'center', color: '#444' }}>
                <input type="checkbox" checked={s.outcomeTagIndices.includes(oi)}
                  onChange={() => {
                    const cur = new Set(s.outcomeTagIndices);
                    cur.has(oi) ? cur.delete(oi) : cur.add(oi);
                    setStep(i, { outcomeTagIndices: [...cur].sort() });
                  }} />
                LO{oi + 1}
              </label>
            ))}
          </div>
          <input style={{ ...input, fontSize: 13, marginBottom: 10 }} value={s.understandingNote}
            placeholder="Understanding note (optional) — what good understanding of this step looks like"
            onChange={e => setStep(i, { understandingNote: e.target.value })} />

          {s.blocks.map((b, bi) => (
            <BlockEditor key={b.blockId} block={b}
              onChange={nb => setStep(i, { blocks: s.blocks.map((x, j) => j === bi ? nb : x) })}
              onMove={dir => setStep(i, { blocks: move(s.blocks, bi, dir) })}
              onDel={() => setStep(i, { blocks: s.blocks.filter((_, j) => j !== bi) })}
              first={bi === 0} last={bi === s.blocks.length - 1}
              imageUpload={imageUpload} />
          ))}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(BLOCK_LABELS) as ContentBlock['type'][]).map(t => (
              <button key={t} type="button" style={{ ...addBtn, fontSize: 12 }}
                onClick={() => setStep(i, { blocks: [...s.blocks, newBlock(t)] })}>
                + {BLOCK_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      ))}

      <button type="button" style={addBtn} onClick={addStep}>+ Add step</button>
    </div>
  );
}

// ── 5. Assessment conversation ────────────────────────────────────────────────
export function ConversationSection({ draft, setData }: SectionProps) {
  const d = draft.data;
  const probingRules = d.probingRules ?? [];
  const vague        = d.vagueAnswerTriggers ?? [];
  const ai = (f: string) => draft.aiFields.includes(f);
  const [preview, setPreview] = useState<any[] | 'loading' | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  async function previewCheckin() {
    setPreview('loading'); setPreviewErr(null);
    try {
      const r = await adminApi.recipe.previewCheckin(draft.moduleId || draft.data.moduleId || 'draft', draft.data);
      setPreview(r.questions);
    } catch (e: any) {
      setPreview(null); setPreviewErr(`Preview failed: ${e.message}`);
    }
  }

  return (
    <div>
      <HelpBlock
        what="How the AI debrief partner behaves after the activity. Probing rules tell it when to dig deeper; vague-answer triggers name the shapes of thin answers; tone guidance sets how it pitches itself to your students. The evaluation rubric is the same master rubric for every module (research comparability) — it is not set here."
        example='IF "student names a transaction code without the business outcome" THEN "ask what the business achieves with that document".' />

      <label style={lbl}>Probing rules — IF trigger / THEN follow-up (max 10) <AiBadge show={ai('probingRules')} /></label>
      <ListEditor items={probingRules} addLabel="Add rule"
        onAdd={() => probingRules.length < 10 && setData({ probingRules: [...probingRules, { trigger: '', followUp: '' }] })}
        renderItem={(p: { trigger: string; followUp: string }, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input style={{ ...input, flex: 1 }} placeholder="IF: trigger pattern" value={p.trigger}
              onChange={e => setItem(d, setData, 'probingRules', i, { trigger: e.target.value })} />
            <input style={{ ...input, flex: 1 }} placeholder="THEN: follow-up" value={p.followUp}
              onChange={e => setItem(d, setData, 'probingRules', i, { followUp: e.target.value })} />
            <Move first={i === 0} last={i === probingRules.length - 1}
              onUp={() => setData({ probingRules: move(probingRules, i, -1) })}
              onDown={() => setData({ probingRules: move(probingRules, i, 1) })}
              onDel={() => setData({ probingRules: probingRules.filter((_, j) => j !== i) })} />
          </div>
        )} />

      <div style={{ height: 16 }} />
      <label style={lbl}>Vague answer triggers (one per line) <AiBadge show={ai('vagueAnswerTriggers')} /></label>
      <textarea style={{ ...input, minHeight: 60 }} value={vague.join('\n')}
        onChange={e => setData({ vagueAnswerTriggers: e.target.value.split('\n') })}
        placeholder={'Student describes a step without explaining its purpose.'} />

      <div style={{ height: 16 }} />
      <label style={lbl}>Tone guidance (optional) <AiBadge show={ai('toneGuidance')} /></label>
      <textarea style={{ ...input, minHeight: 50 }} value={d.toneGuidance ?? ''}
        onChange={e => setData({ toneGuidance: e.target.value })}
        placeholder="e.g. Most students have no prior ERP experience — be patient and scaffolding." />

      <div style={{ height: 20 }} />
      <button type="button" onClick={previewCheckin}
        style={{ background: '#E6F4F1', color: '#085041', border: 'none',
          borderRadius: 4, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}>
        Preview check-in questions
      </button>
      <span style={{ fontSize: 12, color: '#888', marginLeft: 10 }}>
        Sample questions the AI would generate from this draft — actual questions vary per session.
      </span>

      {previewErr && <p style={{ color: '#a33', marginTop: 10 }}>{previewErr}</p>}
      {preview !== null && (
        <div style={{ border: '1px solid #b7d4c9', borderRadius: 6, padding: 16,
          background: '#f6fbf9', marginTop: 12 }}>
          <h3 style={{ marginTop: 0, color: '#085041', fontSize: 15 }}>Sample check-in questions</h3>
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

// ── Review & publish ──────────────────────────────────────────────────────────
export function completeness(draft: RecipeDraft): { errs: string[] } {
  const d = draft.data ?? {};
  const errs: string[] = [];
  const moduleId = (draft.moduleId ?? d.moduleId ?? '').trim();
  if (!moduleId)                        errs.push('Module basics: Module ID is required.');
  if (!d.moduleTitle?.trim())           errs.push('Module basics: title is required.');
  if (!d.moduleDescription?.trim())     errs.push('Module basics: description is required.');
  if ((d.learningOutcomes ?? []).filter(o => o.trim()).length < 2)
    errs.push('Learning outcomes: at least 2 are required.');
  const steps = d.steps ?? [];
  if (!steps.length) errs.push('Activity steps: at least one step is required.');
  for (const s of steps) {
    if (!s.title?.trim())       errs.push(`Activity steps: step ${s.stepNumber} needs a title.`);
    if (!s.description?.trim()) errs.push(`Activity steps: step ${s.stepNumber} needs a description.`);
    if (!(s.blocks ?? []).length) errs.push(`Activity steps: step ${s.stepNumber} has no content blocks.`);
    for (const b of s.blocks ?? []) {
      if (b.type === 'rich_text' && !bodyText(b.body))
        errs.push(`Activity steps: rich text block in step ${s.stepNumber} has no body.`);
      if (b.type === 'guided_tool' && !b.title.trim())
        errs.push(`Activity steps: guided tool block in step ${s.stepNumber} needs a title.`);
      if (b.type === 'guided_tool' && !b.instructions.some(i => bodyText(i.text)))
        errs.push(`Activity steps: guided tool block in step ${s.stepNumber} needs at least one instruction.`);
      if (b.type === 'knowledge_check' && !b.questions.length)
        errs.push(`Activity steps: knowledge check in step ${s.stepNumber} has no questions.`);
      if (b.type === 'checklist' && !b.items.length)
        errs.push(`Activity steps: checklist in step ${s.stepNumber} has no items.`);
    }
  }
  return { errs };
}
