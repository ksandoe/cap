/**
 * assessmentService.ts
 *
 * LLM proxy (OpenAI-compatible). All calls are server-side — the API key
 * is never exposed to the browser.
 *
 * Three call types:
 *   1. generateCheckinQuestions  — one-shot, returns structured question list
 *   2. processConversationTurn   — stateless; full history sent each turn
 *   3. generateEvaluation        — one-shot, returns structured Evaluation object
 *
 * When MOCK_AI is on, returns canned responses from mockAi.ts instead.
 * TODO: load API key from Secrets Manager (not env var) in production
 */
import { Request, Response } from 'express';
import { sessionDb }     from '../../db/sessionDb';
import { recipeDb }      from '../../db/recipeDb';
import { evalDb }        from '../../db/evalDb';
import { moduleConfigDb, DEFAULT_THRESHOLDS } from '../../db/moduleConfigDb';
import { compileContext } from './contextCompiler';
import { platformConfigDb } from '../../db/platformConfigDb';
import { callModel, extractJson } from './llmProvider';
import { logger }        from '../eventLogger';
import { EVENTS, Evaluation } from '@cap/shared';
import { LLM_MODE }      from '../../config/env';
import { mockCheckinQuestions, mockConversationTurn, mockEvaluation } from './mockAi';

const MOCK_AI = LLM_MODE === 'mock';

// Heartbeat — feeds the stale-session sweep (in-progress sessions idle
// >24h are INTERRUPTED and their SAP accounts released).
function touch(sessionId: string) {
  sessionDb.updateSession(sessionId, { lastActivityAt: new Date().toISOString() })
    .catch(() => { /* non-fatal */ });
}

export async function generateCheckinQuestions(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.session!;
  const session = await sessionDb.getSession(sessionId);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }
  const recipe  = await recipeDb.getActiveRecipe(session.moduleId);
  const { checkinSystemPrompt } = compileContext(recipe!, session);

  const raw = MOCK_AI
    ? mockCheckinQuestions()
    : await callModel(checkinSystemPrompt, [
        { role: 'user', content: 'Generate the check-in questions now.' },
      ], { json: true });

  try {
    const parsed = extractJson<any>(raw);
    const questions = Array.isArray(parsed) ? parsed : parsed.questions;
    res.json({ questions });
  } catch {
    res.status(500).json({ error: 'Failed to parse check-in questions from AI response.' });
  }
}

// Lines where the model appears to leak an "ideal answer" (the prompt-
// injection exploit demonstrated in prototype testing). The security rules
// in the system prompt are the primary defense; this filter is a cheap
// output-side backstop for smaller models that ignore them.
const ANSWER_LEAK = /\b(expected|ideal|model|correct|sample)\s+(response|answer|solution)\b/i;

/** Fetch the prior attempt's evaluation for retry sessions (priorSessionId
 *  is the completed session's id — the eval record's key — so no student
 *  identifier is needed). */
async function priorEvaluation(session: any): Promise<Evaluation | null> {
  if (!session?.priorSessionId) return null;
  const rec = await evalDb.getAttempt(session.priorSessionId).catch(() => null);
  return (rec?.evaluation as Evaluation) ?? null;
}

export async function processConversationTurn(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.session!;
  const { messages }  = req.body; // full conversation history from client

  const session = await sessionDb.getSession(sessionId);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }
  touch(sessionId);
  const recipe  = await recipeDb.getActiveRecipe(session.moduleId);
  const prior   = await priorEvaluation(session);
  const rubric  = await platformConfigDb.rubric();
  const { checkoutSystemPrompt } = compileContext(recipe!, session, prior, rubric);

  let raw = MOCK_AI
    ? mockConversationTurn(messages.filter((m: any) => m.role === 'user').length, !!prior)
    : await callModel(checkoutSystemPrompt, messages);
  logger.info(EVENTS.CHECKOUT_TURN, { sessionId, turn: messages.length });

  // Output-side guardrail: strip lines that leak expected/ideal answers.
  if (ANSWER_LEAK.test(raw)) {
    logger.warn(EVENTS.PROMPT_GUARD, { sessionId, snippet: raw.slice(0, 160) });
    raw = raw.split('\n').filter(l => !ANSWER_LEAK.test(l)).join('\n').trim()
      || "I can't share expected answers — but I'm happy to keep talking through what you did.";
  }

  // Persist the transcript on the session record so a saved/interrupted
  // session resumes mid-conversation. Assistant markers ([PHASE:n],
  // [GRACE], [ASSESSMENT:...]) are stripped — they are wire protocol,
  // not content.
  const cleaned = String(raw).replace(/\[PHASE:\d\]|\[GRACE\]|\[ASSESSMENT:[^\]]*\]/g, '').trim();
  sessionDb.updateSession(sessionId, {
    transcript: [...messages, { role: 'assistant', content: cleaned }]
      .map(({ role, content }: any) => ({ role, content })),
  }).catch(() => { /* non-fatal — transcript loss only affects resume fidelity */ });

  res.json({ response: raw });
}

export async function generateEvaluation(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.session!;
  const { transcript } = req.body;

  const session = await sessionDb.getSession(sessionId);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }
  touch(sessionId);
  const recipe  = await recipeDb.getActiveRecipe(session.moduleId);
  const rubric  = await platformConfigDb.rubric();
  const { evaluationSystemPrompt } = compileContext(recipe!, session, undefined, rubric);

  const raw = MOCK_AI
    ? mockEvaluation(recipe!)
    : await callModel(evaluationSystemPrompt, [
        { role: 'user', content: `Here is the full conversation transcript:\n\n${JSON.stringify(transcript)}` },
      ], { json: true });

  try {
    const parsed = extractJson<any>(raw);
    // Normalize to the Evaluation shape — small models improvise field names.
    const ratings = parsed.dimensionRatings ?? parsed.dimensions ?? parsed.dimension_ratings ?? [];
    // Derive numeric scores if the model omitted them, then compute the
    // pass/fail verdict server-side from the module's configured thresholds —
    // the model's own badgeAwarded flag is advisory only.
    const scoreFor = (d: any): number =>
      typeof d.score === 'number' ? d.score
      : d.rating === 'Strong' ? 90 : d.rating === 'Developing' ? 60 : 20;
    const dimensionRatings = ratings.map((d: any) => ({ ...d, score: scoreFor(d) }));
    const overallScore = typeof parsed.overallScore === 'number'
      ? parsed.overallScore
      : dimensionRatings.length
        ? Math.round(dimensionRatings.reduce((a: number, d: any) => a + d.score, 0) / dimensionRatings.length)
        : 0;
    const cfg = await moduleConfigDb.getConfig(session.moduleId)
      .catch(() => ({ ...DEFAULT_THRESHOLDS }));
    const badgeAwarded = overallScore >= cfg.overallMin
      && dimensionRatings.every((d: any) => d.score >= cfg.dimensionFloor);

    res.json({ evaluation: {
      sessionId,
      dimensionRatings,
      outcomeSummary:   parsed.outcomeSummary   ?? parsed.outcomes   ?? parsed.outcome_summary   ?? [],
      overallSummary:   parsed.overallSummary   ?? parsed.overall_summary ?? parsed.summary ?? '',
      overallScore,
      badgeAwarded,
      assessedAt:       parsed.assessedAt       ?? parsed.assessed_at    ?? new Date().toISOString(),
    }});
  } catch {
    res.status(500).json({ error: 'Failed to parse evaluation from AI response.' });
  }
}
