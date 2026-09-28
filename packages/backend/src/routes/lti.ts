/**
 * lti.ts — LTI 1.3 launch routes
 *
 * GET  /lti/oidc/login  — OIDC login initiation (Canvas → platform)
 * POST /lti/launch      — JWT receipt, validation, session creation
 */
import { Router } from 'express';
import { asyncRouter } from '../middleware/asyncRouter';
import { handleOidcLogin, handleLaunch } from '../services/lti/ltiService';

export const ltiRouter = asyncRouter();

ltiRouter.get('/oidc/login', handleOidcLogin);
ltiRouter.post('/launch',    handleLaunch);
