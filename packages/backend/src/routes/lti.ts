/**
 * lti.ts — LTI 1.3 launch routes
 *
 * GET or POST /lti/oidc/login — OIDC login initiation (Canvas → platform).
 *   The LTI standard allows either method; Canvas is reported to send a POST.
 * POST /lti/launch      — JWT receipt, validation, session creation
 */
import { Router } from 'express';
import { asyncRouter } from '../middleware/asyncRouter';
import { handleOidcLogin, handleLaunch } from '../services/lti/ltiService';

export const ltiRouter = asyncRouter();

ltiRouter.get('/oidc/login',  handleOidcLogin);
ltiRouter.post('/oidc/login', handleOidcLogin);
ltiRouter.post('/launch',    handleLaunch);
