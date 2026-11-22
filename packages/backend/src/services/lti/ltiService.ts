/**
 * ltiService.ts
 *
 * Handles the LTI 1.3 OIDC login initiation and launch JWT validation.
 * Uses the `jose` library for JWT operations.
 *
 * Flow:
 *   1. Canvas GET or POST /lti/oidc/login → platform redirects back to Canvas OIDC auth URL
 *   2. Canvas POST /lti/launch     → platform validates JWT, creates session, issues token
 *
 * TODO: implement state/nonce generation and validation (replay protection)
 * TODO: fetch and cache Canvas JWKS for signature verification
 * TODO: extract AGS endpoint and LIS sourcedId from JWT claims
 */
import { Request, Response } from 'express';
import { createSession }     from '../orchestrator/orchestratorService';
import { deriveLearnerKey }  from '../identity/learnerKey';
import { logger }            from '../eventLogger';
import { EVENTS }            from '@cap/shared';

export async function handleOidcLogin(req: Request, res: Response): Promise<void> {
  // The LTI standard lets a platform start login with a GET or a POST (Canvas is reported to
  // send a POST), so read the parameters from the query and the form body. A repeated
  // parameter arrives as an array and is ignored rather than guessed at.
  const received = { ...(req.query as Record<string, unknown>), ...((req.body as Record<string, unknown>) ?? {}) };
  const param = (name: string): string | undefined =>
    typeof received[name] === 'string' ? (received[name] as string) : undefined;

  // Log which parameters arrived, never their values: login_hint identifies the user, and
  // log payloads can reach the audit table.
  logger.info(EVENTS.LTI_LAUNCH_RECEIVED, { method: req.method, params: Object.keys(received).sort() });

  const login_hint       = param('login_hint');
  const lti_message_hint = param('lti_message_hint');
  if (!login_hint) {
    throw Object.assign(new Error('LTI login request is missing login_hint.'),
      { statusCode: 400, code: 'LTI_BAD_LOGIN_REQUEST' });
  }
  const authBase = process.env.LTI_OIDC_AUTH_URL;
  if (!authBase || !process.env.LTI_CLIENT_ID || !process.env.LTI_REDIRECT_URI) {
    throw Object.assign(new Error('LTI is not configured on this server.'),
      { statusCode: 500, code: 'LTI_NOT_CONFIGURED' });
  }

  // TODO: generate state + nonce, store in short-lived DynamoDB record
  const state = 'TODO_generate_state';
  const nonce = 'TODO_generate_nonce';

  const authUrl = new URL(authBase);
  authUrl.searchParams.set('scope',          'openid');
  authUrl.searchParams.set('response_type',  'id_token');
  authUrl.searchParams.set('response_mode',  'form_post');
  authUrl.searchParams.set('prompt',         'none');
  authUrl.searchParams.set('client_id',      process.env.LTI_CLIENT_ID!);
  authUrl.searchParams.set('redirect_uri',   process.env.LTI_REDIRECT_URI!);
  authUrl.searchParams.set('login_hint',     login_hint);
  if (lti_message_hint) authUrl.searchParams.set('lti_message_hint', lti_message_hint);
  authUrl.searchParams.set('state',          state);
  authUrl.searchParams.set('nonce',          nonce);

  res.redirect(authUrl.toString());
}

export async function handleLaunch(req: Request, res: Response): Promise<void> {
  try {
    // TODO: validate state from body against stored nonce
    // TODO: fetch Canvas JWKS and verify JWT signature
    // TODO: validate iss, aud, nonce, exp claims
    const idToken = req.body.id_token as string;
    const claims  = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
    // ^ placeholder: replace with jose jwtVerify() against Canvas JWKS

    // Phase 1 launch data (docs/decisions/2026-10-canvas-lti-atec.md):
    // learner = iss + sub, activity = LIFT-owned custom parameter.
    // No name/email/roster claims are read.
    const custom   = claims['https://purl.imsglobal.org/spec/lti/claim/custom'] ?? {};
    // activity_id is the agreed parameter; module_id is the pre-decision
    // name, accepted so existing placements keep working.
    const moduleId = custom.activity_id ?? custom.module_id;
    if (!moduleId) throw new Error('LTI launch is missing the activity_id custom parameter');

    const ltiContext = {
      canvasUuid:        deriveLearnerKey(claims.iss, claims.sub),
      ltiSub:            claims.sub,   // raw — server-side only, for grade write-back
      ltiContextId:      claims['https://purl.imsglobal.org/spec/lti/claim/context']?.id,
      ltiResourceLinkId: claims['https://purl.imsglobal.org/spec/lti/claim/resource_link']?.id,
      agsEndpoint:       claims['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint']?.lineitem,
      lisResultSourcedId:claims['https://purl.imsglobal.org/spec/lti/claim/lis']?.result_sourcedid,
      moduleId,
    };

    logger.info(EVENTS.LTI_LAUNCH_VALIDATED, { moduleId: ltiContext.moduleId });

    const { sessionToken, redirectPhase } = await createSession(ltiContext);

    // Redirect student into the React SPA with their session token
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    res.redirect(`${frontendUrl}/launch?token=${sessionToken}&phase=${redirectPhase}`);
  } catch (err) {
    logger.error(EVENTS.LTI_LAUNCH_FAILED, { error: String(err) });
    res.status(400).send('LTI launch failed. Please try again from Canvas.');
  }
}
