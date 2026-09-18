/**
 * badgeService.ts
 *
 * Issues a Credly badge assertion when badge_awarded = true.
 * Uses a stored OAuth 2.0 refresh token to obtain short-lived access tokens.
 *
 * TODO: implement refresh token → access token exchange
 * TODO: implement evidence URL generation (signed token, 90-day expiry)
 * TODO: implement retry with exponential backoff
 */
import axios  from 'axios';
import { logger } from '../eventLogger';
import { EVENTS } from '@cap/shared';
import { USE_LOCAL_DB } from '../../config/env';

export async function issueBadge(session: any): Promise<void> {
  // Local dev: no Credly instance — log the event and return
  if (USE_LOCAL_DB) {
    logger.info(EVENTS.BADGE_ISSUED, { sessionId: session.sessionId, assertionId: 'SIM-ASSERTION', simulated: true });
    return;
  }
  try {
    // TODO: load badge_template_id from module config
    const badgeTemplateId = 'TODO_from_module_config';
    const recipientEmail  = 'TODO_from_identity_map_or_lti_claims';

    // TODO: fetch Credly access token from refresh token
    const accessToken = 'TODO_credly_access_token';

    const resp = await axios.post(
      `${process.env.CREDLY_API_BASE}/organizations/${process.env.CREDLY_ORG_ID}/badges`,
      {
        recipient_email:   recipientEmail,
        badge_template_id: badgeTemplateId,
        issued_at:         session.completedAt,
        evidence_url:      `TODO_generate_evidence_url/${session.sessionId}`,
      },
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10_000 }
    );

    const assertionId = resp.data?.data?.id;
    logger.info(EVENTS.BADGE_ISSUED, { sessionId: session.sessionId, assertionId });
  } catch (err) {
    logger.error(EVENTS.BADGE_ISSUE_FAILED, { sessionId: session.sessionId, error: String(err) });
    throw err;
  }
}
