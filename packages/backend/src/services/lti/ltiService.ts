/**
 * ltiService.ts
 *
 * Handles the LTI 1.3 OIDC login initiation and launch JWT validation.
 * Uses the `jose` library for JWT operations.
 *
 * Flow:
 *   1. Canvas GET /lti/oidc/login  → platform redirects back to Canvas OIDC auth URL
 *   2. Canvas POST /lti/launch     → platform validates JWT, creates session, issues token
 *
 * TODO: implement state/nonce generation and validation (replay protection)
 * TODO: fetch and cache Canvas JWKS for signature verification
 * TODO: extract AGS endpoint and LIS sourcedId from JWT claims
 */
import { Request, Response } from 'express';
import { createSession }     from '../orchestrator/orchestratorService';
import { logger }            from '../eventLogger';
import { EVENTS }            from '@cap/shared';

export async function handleOidcLogin(req: Request, res: Response): Promise<void> {
  logger.info(EVENTS.LTI_LAUNCH_RECEIVED, { query: req.query });

  const { iss, login_hint, target_link_uri, lti_message_hint } = req.query as Record<string,string>;

  // TODO: generate state + nonce, store in short-lived DynamoDB record
  const state = 'TODO_generate_state';
  const nonce = 'TODO_generate_nonce';

  const authUrl = new URL(process.env.LTI_OIDC_AUTH_URL!);
  authUrl.searchParams.set('scope',          'openid');
  authUrl.searchParams.set('response_type',  'id_token');
  authUrl.searchParams.set('response_mode',  'form_post');
  authUrl.searchParams.set('prompt',         'none');
  authUrl.searchParams.set('client_id',      process.env.LTI_CLIENT_ID!);
  authUrl.searchParams.set('redirect_uri',   process.env.LTI_REDIRECT_URI!);
  authUrl.searchParams.set('login_hint',     login_hint);
  authUrl.searchParams.set('lti_message_hint', lti_message_hint);
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

    const ltiContext = {
      canvasUuid:        claims.sub,
      ltiContextId:      claims['https://purl.imsglobal.org/spec/lti/claim/context']?.id,
      ltiResourceLinkId: claims['https://purl.imsglobal.org/spec/lti/claim/resource_link']?.id,
      agsEndpoint:       claims['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint']?.lineitem,
      lisResultSourcedId:claims['https://purl.imsglobal.org/spec/lti/claim/lis']?.result_sourcedid,
      // moduleId is derived from resource link or custom claim
      moduleId:          claims['https://purl.imsglobal.org/spec/lti/claim/custom']?.module_id,
    };

    logger.info(EVENTS.LTI_LAUNCH_VALIDATED, { canvasUuid: 'REDACTED', moduleId: ltiContext.moduleId });

    const { sessionToken, redirectPhase } = await createSession(ltiContext);

    // Redirect student into the React SPA with their session token
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    res.redirect(`${frontendUrl}/launch?token=${sessionToken}&phase=${redirectPhase}`);
  } catch (err) {
    logger.error(EVENTS.LTI_LAUNCH_FAILED, { error: String(err) });
    res.status(400).send('LTI launch failed. Please try again from Canvas.');
  }
}
