/**
 * recipe.ts — Instructional recipe routes
 *
 * GET  /recipe/:moduleId         — Get active recipe for a module
 * POST /recipe                   — Create or update a recipe (authoring mode)
 * GET  /recipe/:moduleId/list    — List versions for a module
 */
import { Router } from 'express';
import { asyncRouter } from '../middleware/asyncRouter';
import { getRecipe, upsertRecipe, listVersions, previewCheckin } from '../services/assessment/recipeService';

export const recipeRouter = asyncRouter();

recipeRouter.get( '/:moduleId',                  getRecipe);
recipeRouter.post('/',                           upsertRecipe);
recipeRouter.get( '/:moduleId/list',             listVersions);
recipeRouter.post('/:moduleId/preview-checkin',  previewCheckin);
