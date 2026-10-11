/**
 * authoringService.ts — Guided authoring backend (v3).
 *
 * Supports the wizard + AI generation dialog in the Admin App:
 *   - Draft CRUD        — server-side drafts so authoring spans sessions
 *   - extractText       — base64 file upload → plain text (PDF/DOCX/TXT)
 *   - generate          — LLM drafts the recipe-side fields from materials
 *   - publishDraft      — validates + saves as a new recipe version
 *
 * All routes sit under /admin/authoring/* behind requireRole(author|admin).
 * File contents never persist — only the extracted text, stored on the
 * draft's sourceMaterials so the author can regenerate sections later.
 */
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  RecipeDraft, GeneratedRecipe, AuthoringSectionId, SourceMaterial,
} from '@cap/shared';
import { draftDb }  from '../../db/draftDb';
import { recipeDb } from '../../db/recipeDb';
import { callModel, extractJson } from '../assessment/llmProvider';
import { LLM_MODE } from '../../config/env';
import { mockGeneratedRecipe } from '../assessment/mockAi';
import { logger } from '../eventLogger';

const MAX_FILE_BYTES = 5 * 1024 * 1024;      // decoded upload ceiling
const MAX_MATERIALS  = 8;                     // sources per generation call
const MAX_TOTAL_CHARS = 100_000;              // combined source text cap

const now = () => new Date().toISOString();

const EMPTY_SECTIONS: RecipeDraft['sections'] = {
  basics: 'todo', outcomes: 'todo', concepts: 'todo',
  activity: 'todo', conversation: 'todo',
};

// ── Draft CRUD ────────────────────────────────────────────────────────────────

export async function listDrafts(_req: Request, res: Response): Promise<void> {
  const drafts = (await draftDb.list())
    .filter(d => !d.published)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  res.json({ drafts });
}

export async function createDraft(req: Request, res: Response): Promise<void> {
  const { title, owner, data, sourceMaterials } = req.body ?? {};
  const draft: RecipeDraft = {
    draftId:         `draft-${uuidv4()}`,
    title:           typeof title === 'string' && title.trim() ? title.trim() : 'Untitled draft',
    owner:           typeof owner === 'string' && owner.trim() ? owner.trim() : undefined,
    sections:        { ...EMPTY_SECTIONS },
    data:            data ?? {},
    sourceMaterials: Array.isArray(sourceMaterials) ? sourceMaterials : [],
    aiFields:        [],
    createdAt:       now(),
    updatedAt:       now(),
  };
  await draftDb.put(draft);
  res.status(201).json({ draft });
}

export async function getDraft(req: Request, res: Response): Promise<void> {
  const draft = await draftDb.get(req.params.id);
  if (!draft) { res.status(404).json({ error: 'DRAFT_NOT_FOUND' }); return; }
  res.json({ draft });
}

export async function updateDraft(req: Request, res: Response): Promise<void> {
  const draft = await draftDb.get(req.params.id);
  if (!draft) { res.status(404).json({ error: 'DRAFT_NOT_FOUND' }); return; }
  const { title, owner, moduleId, sections, data, sourceMaterials, contextAnswers, aiFields } = req.body ?? {};
  const updated: RecipeDraft = { ...draft, updatedAt: now() };
  if (title           !== undefined) updated.title           = title;
  if (owner           !== undefined) updated.owner           = owner;
  if (moduleId        !== undefined) updated.moduleId        = moduleId;
  if (sections        !== undefined) updated.sections        = sections;
  if (data            !== undefined) updated.data            = data;
  if (sourceMaterials !== undefined) updated.sourceMaterials = sourceMaterials;
  if (contextAnswers  !== undefined) updated.contextAnswers  = contextAnswers;
  if (aiFields        !== undefined) updated.aiFields        = aiFields;
  await draftDb.put(updated);
  res.json({ draft: updated });
}

export async function deleteDraft(req: Request, res: Response): Promise<void> {
  const draft = await draftDb.get(req.params.id);
  if (!draft) { res.status(404).json({ error: 'DRAFT_NOT_FOUND' }); return; }
  await draftDb.remove(req.params.id);
  res.json({ ok: true });
}

// ── File → text extraction ────────────────────────────────────────────────────

/** Lazy imports keep heavy parsers out of the Lambda cold path until used.
 *  unpdf (not pdf-parse) because it embeds pdf.js with no external worker
 *  file — pdf-parse v2 tries to load pdf.worker.mjs relative to the bundle
 *  and fails in the esbuilt Lambda. */
async function extractPdf(buf: Buffer): Promise<string> {
  const { extractText } = await import('unpdf');
  const r = await extractText(new Uint8Array(buf), { mergePages: true });
  return Array.isArray(r.text) ? r.text.join('\n\n') : r.text;
}

async function extractDocx(buf: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const r = await mammoth.extractRawText({ buffer: buf });
  return r.value;
}

export async function extractText(req: Request, res: Response): Promise<void> {
  const { filename, data } = req.body ?? {};
  if (!filename || typeof filename !== 'string' || !data || typeof data !== 'string') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'filename and base64 data required.' } });
    return;
  }
  const buf = Buffer.from(data, 'base64');
  if (!buf.length || buf.length > MAX_FILE_BYTES) {
    res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'File must be under 5 MB.' } });
    return;
  }

  const ext = filename.toLowerCase().split('.').pop() ?? '';
  try {
    let text = '';
    if (ext === 'pdf')            text = await extractPdf(buf);
    else if (ext === 'docx')      text = await extractDocx(buf);
    else if (ext === 'doc')       { res.status(415).json({ error: { code: 'UNSUPPORTED_TYPE', message: 'Legacy .doc is not supported — save as .docx or paste the text.' } }); return; }
    else                          text = buf.toString('utf-8'); // .txt/.md/anything else as text
    text = text.replace(/\x00/g, " ").replace(/\r\n?/g, "\n").trim();
    if (!text) {
      res.status(422).json({ error: { code: 'NO_TEXT', message: 'No readable text found in that file.' } });
      return;
    }
    res.json({ filename, text, chars: text.length });
  } catch (err) {
    logger.error('AUTHORING_EXTRACT_FAILED', { filename, error: String(err) });
    res.status(422).json({ error: { code: 'EXTRACT_FAILED', message: `Could not read ${filename} — try pasting the text instead.` } });
  }
}

// ── AI recipe generation ──────────────────────────────────────────────────────

const GENERATION_SCHEMA = `{
  "moduleTitle": "short title (3-6 words)",
  "moduleDescription": "1-3 sentences: what the student does and why it matters",
  "learningOutcomes": ["3-6 observable outcomes, each starting with a verb"],
  "keyConcepts": [{ "term": "...", "definition": "one plain-language sentence" }],
  "probingRules": [{ "trigger": "the SHAPE of a weak/vague answer (a pattern, not a keyword)", "followUp": "what the agent should ask next — aim at the understanding gap" }],
  "vagueAnswerTriggers": ["one per line: shapes of thin answers worth a follow-up"],
  "toneGuidance": "1-3 sentences on the student audience and how the agent should pitch itself"
}`;

function generationPrompt(materials: SourceMaterial[], answers: Record<string, string>, guidance?: string): string {
  const docs = materials.map((m, i) =>
    `--- SOURCE ${i + 1}: ${m.label} ---\n${m.text}`).join('\n\n');
  const qa = Object.entries(answers)
    .filter(([, a]) => a.trim())
    .map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n');
  return `
You are helping a university instructor draft the "assessment recipe" for a
guided-learning module on the Conversational Assessment Platform. Students
complete a hands-on activity, then have a short reflective conversation with
an AI debrief partner; the recipe shapes that conversation.

From the instructor's source materials below, draft ONLY the recipe-side
fields — do NOT invent activity steps, tool instructions, or procedures the
materials don't describe. Ground everything in the sources; where the
sources are silent, write plausible generic content the author can edit.

SOURCE MATERIALS:
${docs || '(none provided)'}

${qa ? `AUTHOR'S ANSWERS TO CLARIFYING QUESTIONS:\n${qa}\n` : ''}
${guidance?.trim() ? `ADDITIONAL GUIDANCE FROM THE AUTHOR:\n${guidance.trim()}\n` : ''}

Requirements:
- Learning outcomes: observable, assessment-ready verbs; 3-6 items.
- Key concepts: the terms a novice would trip on; 3-8 items.
- Probing rules: 4-8 IF/THEN pairs describing vague-answer patterns and
  follow-ups that draw out reasoning (not fact-checking).
- Vague answer triggers: 3-6 one-line patterns.
- Tone guidance: assume students are novices unless the materials say
  otherwise — patient, scaffolding, mentoring.

Respond ONLY with a JSON object of exactly this shape:
${GENERATION_SCHEMA}
`.trim();
}

export async function generate(req: Request, res: Response): Promise<void> {
  const { materials, answers, guidance, draftId } = req.body ?? {};
  const mats: SourceMaterial[] = Array.isArray(materials) ? materials : [];
  if (mats.length > MAX_MATERIALS) {
    res.status(400).json({ error: { code: 'TOO_MANY_SOURCES', message: `At most ${MAX_MATERIALS} sources.` } });
    return;
  }
  const total = mats.reduce((a, m) => a + String(m?.text ?? '').length, 0);
  if (total > MAX_TOTAL_CHARS) {
    res.status(413).json({ error: { code: 'TOO_MUCH_TEXT', message: 'Source materials exceed 100,000 characters — trim or summarize the longest ones.' } });
    return;
  }

  const raw = LLM_MODE === 'mock'
    ? mockGeneratedRecipe()
    : await callModel(
        generationPrompt(mats, answers ?? {}, guidance),
        [{ role: 'user', content: 'Draft the recipe fields now.' }],
        { json: true, maxTokens: 4096 },
      );

  let generated: GeneratedRecipe;
  try {
    generated = extractJson<GeneratedRecipe>(raw);
  } catch {
    res.status(500).json({ error: 'Failed to parse generated recipe from AI response.' });
    return;
  }
  logger.info('AUTHORING_GENERATED', { draftId: draftId ?? null, sources: mats.length });

  // Optionally merge into an existing draft and mark the AI-drafted fields.
  if (draftId) {
    const draft = await draftDb.get(draftId);
    if (draft) {
      const merged: RecipeDraft = {
        ...draft,
        title: draft.data?.moduleTitle ? draft.title : (generated.moduleTitle || draft.title),
        data: { ...draft.data, ...generated },
        sourceMaterials: mats,
        aiFields: [...new Set([...draft.aiFields,
          'moduleTitle', 'moduleDescription', 'learningOutcomes', 'keyConcepts',
          'probingRules', 'vagueAnswerTriggers', 'toneGuidance'])],
        sections: {
          ...draft.sections,
          basics: draft.sections.basics === 'done' ? 'done' : 'in_progress',
          outcomes: draft.sections.outcomes === 'done' ? 'done' : 'in_progress',
          concepts: draft.sections.concepts === 'done' ? 'done' : 'in_progress',
          conversation: draft.sections.conversation === 'done' ? 'done' : 'in_progress',
        },
        updatedAt: now(),
      };
      await draftDb.put(merged);
      res.json({ generated, draft: merged });
      return;
    }
  }
  res.json({ generated });
}

// ── Publish ───────────────────────────────────────────────────────────────────

function validateForPublish(draft: RecipeDraft): string[] {
  const d = draft.data ?? {};
  const errs: string[] = [];
  const moduleId = (draft.moduleId ?? d.moduleId ?? '').trim();
  if (!moduleId)                        errs.push('Module ID is required.');
  if (!d.moduleTitle?.trim())           errs.push('Module title is required.');
  if (!d.moduleDescription?.trim())     errs.push('Module description is required.');
  if ((d.learningOutcomes ?? []).filter(o => o.trim()).length < 2)
    errs.push('At least 2 learning outcomes are required.');
  if (!(d.steps ?? []).length)          errs.push('At least one activity step is required.');
  for (const s of d.steps ?? []) {
    if (!s.title?.trim())       errs.push(`Step ${s.stepNumber} needs a title.`);
    if (!s.description?.trim()) errs.push(`Step ${s.stepNumber} needs a description.`);
    if (!(s.blocks ?? []).length) errs.push(`Step ${s.stepNumber} has no content blocks.`);
  }
  return errs;
}

export async function publishDraft(req: Request, res: Response): Promise<void> {
  const draft = await draftDb.get(req.params.id);
  if (!draft) { res.status(404).json({ error: 'DRAFT_NOT_FOUND' }); return; }

  const errs = validateForPublish(draft);
  if (errs.length) {
    res.status(422).json({ error: { code: 'VALIDATION', messages: errs } });
    return;
  }

  const d = draft.data!;
  const saved = await recipeDb.saveRecipe({
    ...(d.recipeId ? { recipeId: d.recipeId } : {}),
    moduleId:          (draft.moduleId ?? d.moduleId)!.trim(),
    moduleTitle:       d.moduleTitle!.trim(),
    moduleDescription: d.moduleDescription!.trim(),
    learningOutcomes:  (d.learningOutcomes ?? []).map(o => o.trim()).filter(Boolean),
    keyConcepts:       (d.keyConcepts ?? []).filter(c => c.term?.trim()),
    parameters:        (d.parameters ?? []).filter(p => p.key?.trim()),
    steps:             (d.steps ?? []).map((s, i) => ({ ...s, stepNumber: i + 1 })),
    probingRules:      (d.probingRules ?? []).filter(p => p.trigger?.trim()),
    vagueAnswerTriggers: (d.vagueAnswerTriggers ?? []).filter(Boolean),
    toneGuidance:      d.toneGuidance?.trim() || undefined,
    // Source materials ride onto the published recipe as background docs so
    // the conversation keeps the grounding the author generated from.
    backgroundDocs:    d.backgroundDocs ?? (draft.sourceMaterials ?? [])
      .map(m => ({ type: 'text' as const, content: m.text, label: m.label })),
  });

  await draftDb.put({ ...draft, published: true, updatedAt: now() });
  logger.info('AUTHORING_PUBLISHED', { draftId: draft.draftId, moduleId: saved.moduleId, version: saved.version });
  res.json({ recipe: saved });
}
