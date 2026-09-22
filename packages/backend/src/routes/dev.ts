/**
 * dev.ts — Development / demo routes ("Canvas launchpad").
 *
 * Mounted when NODE_ENV !== 'production' OR ENABLE_DEV_ROUTES=true.
 * The latter exists so a deployed demo build can expose the launchpad
 * while campus LTI registration is pending. NEVER enable in production —
 * these routes create sessions without LTI JWT validation.
 *
 * GET /dev/modules                    — list launchable modules (active recipes)
 * GET /dev/launch?moduleId&persona    — simulate a Canvas LTI launch: create or
 *                                       resume a session for a synthetic
 *                                       identity and redirect to the SPA with
 *                                       a session token, exactly as the real
 *                                       LTI launch does.
 *
 * Personas map to stable canvasUuids so resume/retry behavior is demoable:
 * relaunching the same module as the same persona resumes their session.
 */
import { Router, Request, Response } from 'express';
import { asyncRouter } from '../middleware/asyncRouter';
import { createSession }        from '../services/orchestrator/orchestratorService';
import { LOCAL_DEMO_MODULE_ID, listModules } from '../db/localStore';
import { USE_LOCAL_DB }         from '../config/env';
import { auroraConfigured, query } from '../db/auroraDb';
import { logger }               from '../services/eventLogger';
import { EVENTS }               from '@cap/shared';

export const devRouter = asyncRouter();

// Demo personas — stable identities so each "student" keeps their own session
const PERSONAS: Record<string, string> = {
  alex:  'dev-alex',
  blair: 'dev-blair',
  casey: 'dev-casey',
};

devRouter.get('/modules', async (_req: Request, res: Response) => {
  if (USE_LOCAL_DB) {
    res.json({ modules: listModules() });
    return;
  }
  if (auroraConfigured()) {
    const r = await query<{ module_id: string; module_title: string }>(
      `SELECT module_id, payload->>'moduleTitle' AS module_title
       FROM recipes WHERE is_active = true ORDER BY module_id`);
    res.json({ modules: r.rows.map(m => ({ moduleId: m.module_id, moduleTitle: m.module_title })) });
    return;
  }
  res.json({ modules: [] });
});

devRouter.get('/launch', async (req: Request, res: Response) => {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  try {
    const moduleId = (req.query.moduleId as string) || LOCAL_DEMO_MODULE_ID;
    const persona  = (req.query.persona as string) || 'alex';
    const canvasUuid = PERSONAS[persona] ?? `dev-${persona}`;

    const { sessionToken, redirectPhase } = await createSession({
      canvasUuid,                          // stable identity → resume works across relaunches
      ltiContextId:       `dev-context-${moduleId}`,
      ltiResourceLinkId:  'dev-resource-link',
      agsEndpoint:        'local-dev',
      lisResultSourcedId: 'local-dev',
      moduleId,
    });
    res.redirect(`${frontendUrl}/launch?token=${sessionToken}&phase=${redirectPhase}`);
  } catch (err) {
    logger.error(EVENTS.LTI_LAUNCH_FAILED, { error: String(err), source: 'dev-launch' });
    const code = err instanceof Error ? err.message : 'UNKNOWN';
    res.redirect(`${frontendUrl}/error?code=${encodeURIComponent(code)}`);
  }
});
