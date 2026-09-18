/**
 * recipeService.ts — Instructional recipe CRUD (authoring mode)
 * Recipes are stored in cap-recipes DynamoDB table.
 */
import { Request, Response } from 'express';
import { recipeDb } from '../../db/recipeDb';

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
