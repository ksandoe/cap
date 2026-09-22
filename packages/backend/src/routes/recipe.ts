/**
 * recipe.ts — Instructional recipe routes
 *
 * GET  /recipe/:moduleId         — Get active recipe for a module
 * POST /recipe                   — Create or update a recipe (authoring mode)
 * GET  /recipe/:moduleId/list    — List versions for a module
 */
import { Router } from 'express';
import { asyncRouter } from '../middleware/asyncRouter';
import { requireRole } from '../middleware/requireRole';
import { getRecipe, upsertRecipe, listVersions, previewCheckin, listAllRecipes } from '../services/assessment/recipeService';

export const recipeRouter = asyncRouter();

// Authoring surface — requires an admin JWT with author/admin role.
// GET /:moduleId stays open to student session tokens (the wizard needs it).
recipeRouter.get( '/',                           requireRole(['author','admin']), listAllRecipes);
recipeRouter.post('/',                           requireRole(['author','admin']), upsertRecipe);
recipeRouter.post('/:moduleId/preview-checkin',  requireRole(['author','admin']), previewCheckin);
recipeRouter.get( '/:moduleId',                  getRecipe);
recipeRouter.get( '/:moduleId/list',             requireRole(['author','admin']), listVersions);
