/**
 * recipeService.ts — Instructional recipe CRUD (authoring mode)
 * Recipes are stored in cap-recipes DynamoDB table.
 */
import { Request, Response } from 'express';
import { recipeDb } from '../../db/recipeDb';
import { compileContext } from './contextCompiler';
import { callModel, extractJson } from './llmProvider';
import { LLM_MODE }       from '../../config/env';
import { mockCheckinQuestions } from './mockAi';
import { normalizeCheckinOptions, validateCheckinQuestions, cleanCheckinQuestions } from '@cap/shared';

export async function getRecipe(req: Request, res: Response): Promise<void> {
  const recipe = await recipeDb.getActiveRecipe(req.params.moduleId);
  if (!recipe) { res.status(404).json({ error: 'RECIPE_NOT_FOUND' }); return; }
  res.json(recipe);
}

/** GET /recipe — all recipe versions across modules (Admin App list page). */
export async function listAllRecipes(_req: Request, res: Response): Promise<void> {
  res.json({ recipes: await recipeDb.listAllRecipes() });
}

export async function upsertRecipe(req: Request, res: Response): Promise<void> {
  const body = { ...req.body };
  // A fixed check-in questionnaire goes to every student, so a malformed one is
  // refused here instead of being found by a student. An empty list means "no
  // fixed questionnaire" and is stored as absent.
  if (body.checkinQuestions !== undefined) {
    if (Array.isArray(body.checkinQuestions) && body.checkinQuestions.length === 0) {
      delete body.checkinQuestions;
    } else {
      const problems = validateCheckinQuestions(body.checkinQuestions);
      if (problems.length) {
        res.status(400).json({ error: 'INVALID_CHECKIN_QUESTIONS', problems });
        return;
      }
      body.checkinQuestions = cleanCheckinQuestions(body.checkinQuestions);
    }
  }
  if (!body.recipeId) body.recipeId = crypto.randomUUID();
  const saved = await recipeDb.saveRecipe(body);
  res.json(saved);
}

export async function listVersions(req: Request, res: Response): Promise<void> {
  const versions = await recipeDb.listVersions(req.params.moduleId);
  res.json({ versions });
}

/**
 * POST /recipe/:moduleId/preview-checkin — AUT-08.
 * Generates sample check-in questions from an unsaved recipe (sent in the
 * request body) or falls back to the active version. Does not save anything.
 */
export async function previewCheckin(req: Request, res: Response): Promise<void> {
  const draft  = req.body?.recipe;
  const recipe = draft ?? await recipeDb.getActiveRecipe(req.params.moduleId);
  if (!recipe) { res.status(404).json({ error: 'RECIPE_NOT_FOUND' }); return; }

  const { checkinSystemPrompt } = compileContext(recipe, {});
  const raw = LLM_MODE === 'mock'
    ? mockCheckinQuestions()
    : await callModel(checkinSystemPrompt, [
        { role: 'user', content: 'Generate the check-in questions now.' },
      ], { json: true });

  try {
    const parsed = extractJson<any>(raw);
    const list: any[] = (Array.isArray(parsed) ? parsed : parsed.questions) ?? [];
    const questions = list.map(q => ({ ...q, options: normalizeCheckinOptions(q.options) }));
    res.json({ questions, sample: true });
  } catch {
    res.status(500).json({ error: 'Failed to parse check-in questions from AI response.' });
  }
}
