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
import { compileContext } from './contextCompiler';
import { callModel, extractJson } from './llmProvider';
import { logger }        from '../eventLogger';
import { EVENTS }        from '@cap/shared';
import { LLM_MODE }      from '../../config/env';
import { mockCheckinQuestions, mockConversationTurn, mockEvaluation } from './mockAi';

const MOCK_AI = LLM_MODE === 'mock';

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

export async function processConversationTurn(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.session!;
  const { messages }  = req.body; // full conversation history from client

  const session = await sessionDb.getSession(sessionId);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }
  const recipe  = await recipeDb.getActiveRecipe(session.moduleId);
  const { checkoutSystemPrompt } = compileContext(recipe!, session);

  const raw = MOCK_AI
    ? mockConversationTurn(messages.filter((m: any) => m.role === 'user').length)
    : await callModel(checkoutSystemPrompt, messages);
  logger.info(EVENTS.CHECKOUT_TURN, { sessionId, turn: messages.length });

  res.json({ response: raw });
}

export async function generateEvaluation(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.session!;
  const { transcript } = req.body;

  const session = await sessionDb.getSession(sessionId);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }
  const recipe  = await recipeDb.getActiveRecipe(session.moduleId);
  const { evaluationSystemPrompt } = compileContext(recipe!, session);

  const raw = MOCK_AI
    ? mockEvaluation(recipe!)
    : await callModel(evaluationSystemPrompt, [
        { role: 'user', content: `Here is the full conversation transcript:\n\n${JSON.stringify(transcript)}` },
      ], { json: true });

  try {
    const parsed = extractJson<any>(raw);
    // Normalize to the Evaluation shape — small models improvise field names.
    res.json({ evaluation: {
      sessionId,
      dimensionRatings: parsed.dimensionRatings ?? parsed.dimensions ?? parsed.dimension_ratings ?? [],
      outcomeSummary:   parsed.outcomeSummary   ?? parsed.outcomes   ?? parsed.outcome_summary   ?? [],
      overallSummary:   parsed.overallSummary   ?? parsed.overall_summary ?? parsed.summary ?? '',
      badgeAwarded:     parsed.badgeAwarded     ?? parsed.badge_awarded  ?? false,
      assessedAt:       parsed.assessedAt       ?? parsed.assessed_at    ?? new Date().toISOString(),
    }});
  } catch {
    res.status(500).json({ error: 'Failed to parse evaluation from AI response.' });
  }
}
