/**
 * recipe.ts — Instructional recipe routes
 *
 * GET  /recipe/:moduleId         — Get active recipe for a module
 * POST /recipe                   — Create or update a recipe (authoring mode)
 * GET  /recipe/:moduleId/list    — List versions for a module
 */
import { Router } from 'express';
import { getRecipe, upsertRecipe, listVersions } from '../services/assessment/recipeService';

export const recipeRouter = Router();

recipeRouter.get( '/:moduleId',        getRecipe);
recipeRouter.post('/',                 upsertRecipe);
recipeRouter.get( '/:moduleId/list',   listVersions);
