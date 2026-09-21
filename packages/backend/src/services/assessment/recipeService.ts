/**
 * recipeService.ts — Instructional recipe CRUD (authoring mode)
 * Recipes are stored in cap-recipes DynamoDB table.
 */
import { Request, Response } from 'express';
import { recipeDb } from '../../db/recipeDb';
import { compileContext } from './contextCompiler';
import { callModel }      from './llmProvider';
import { LLM_MODE }       from '../../config/env';
import { mockCheckinQuestions } from './mockAi';

export async function getRecipe(req: Request, res: Response): Promise<void> {
  const recipe = await recipeDb.getActiveRecipe(req.params.moduleId);
  if (!recipe) { res.status(404).json({ error: 'RECIPE_NOT_FOUND' }); return; }
  res.json(recipe);
}

export async function upsertRecipe(req: Request, res: Response): Promise<void> {
  const saved = await recipeDb.saveRecipe(req.body);
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
      ]);

  try {
    res.json({ questions: JSON.parse(raw), sample: true });
  } catch {
    res.status(500).json({ error: 'Failed to parse check-in questions from AI response.' });
  }
}
