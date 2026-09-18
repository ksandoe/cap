/**
 * assessmentService.ts
 *
 * Anthropic API proxy. All calls are server-side — the API key
 * is never exposed to the browser.
 *
 * Three call types:
 *   1. generateCheckinQuestions  — one-shot, returns structured question list
 *   2. processConversationTurn   — stateless; full history sent each turn
 *   3. generateEvaluation        — one-shot, returns structured Evaluation object
 *
 * TODO: load API key from Secrets Manager (not env var) in production
 */
import { Request, Response } from 'express';
import axios from 'axios';
import { sessionDb }     from '../../db/sessionDb';
import { recipeDb }      from '../../db/recipeDb';
import { compileContext } from './contextCompiler';
import { logger }        from '../eventLogger';
import { EVENTS }        from '@cap/shared';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-sonnet-4-6';

async function callAnthropic(systemPrompt: string, messages: {role:string;content:string}[]) {
  const resp = await axios.post(ANTHROPIC_API, {
    model: MODEL, max_tokens: 1024, system: systemPrompt, messages,
  }, {
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    timeout: 30_000,
  });
  return resp.data.content?.[0]?.text ?? '';
}

export async function generateCheckinQuestions(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.session!;
  const session = await sessionDb.getSession(sessionId);
  const recipe  = await recipeDb.getActiveRecipe(session!.moduleId);
  const { checkinSystemPrompt } = compileContext(recipe!, session!);

  const raw = await callAnthropic(checkinSystemPrompt, [
    { role: 'user', content: 'Generate the check-in questions now.' },
  ]);

  try {
    const questions = JSON.parse(raw);
    res.json({ questions });
  } catch {
    res.status(500).json({ error: 'Failed to parse check-in questions from AI response.' });
  }
}

export async function processConversationTurn(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.session!;
  const { messages }  = req.body; // full conversation history from client

  const session = await sessionDb.getSession(sessionId);
  const recipe  = await recipeDb.getActiveRecipe(session!.moduleId);
  const { checkoutSystemPrompt } = compileContext(recipe!, session!);

  const raw = await callAnthropic(checkoutSystemPrompt, messages);
  logger.info(EVENTS.CHECKOUT_TURN, { sessionId, turn: messages.length });

  res.json({ response: raw });
}

export async function generateEvaluation(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.session!;
  const { transcript } = req.body;

  const session = await sessionDb.getSession(sessionId);
  const recipe  = await recipeDb.getActiveRecipe(session!.moduleId);
  const { evaluationSystemPrompt } = compileContext(recipe!, session!);

  const raw = await callAnthropic(evaluationSystemPrompt, [
    { role: 'user', content: `Here is the full conversation transcript:\n\n${JSON.stringify(transcript)}` },
  ]);

  try {
    const evaluation = JSON.parse(raw.replace(/```json|```/g, '').trim());
    res.json({ evaluation });
  } catch {
    res.status(500).json({ error: 'Failed to parse evaluation from AI response.' });
  }
}
