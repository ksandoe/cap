/**
 * dev.ts — Local development routes. Mounted only when NODE_ENV !== 'production'.
 *
 * GET /dev/launch?moduleId=<id> — Simulates an LTI launch without Canvas:
 * creates (or resumes) a session for a synthetic dev identity and redirects
 * to the SPA with a session token, exactly as the real LTI launch does.
 */
import { Router, Request, Response } from 'express';
import { createSession }        from '../services/orchestrator/orchestratorService';
import { LOCAL_DEMO_MODULE_ID } from '../db/localStore';
import { logger }               from '../services/eventLogger';
import { EVENTS }               from '@cap/shared';

export const devRouter = Router();

devRouter.get('/launch', async (req: Request, res: Response) => {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  try {
    const moduleId = (req.query.moduleId as string) || LOCAL_DEMO_MODULE_ID;
    const { sessionToken, redirectPhase } = await createSession({
      canvasUuid:         'dev-student',   // stable identity → resume works across relaunches
      ltiContextId:       'dev-context',
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
