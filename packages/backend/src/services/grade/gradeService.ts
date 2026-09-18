/**
 * gradeService.ts
 *
 * Posts a completion score back to Canvas via LTI Advantage
 * Assignment and Grade Services (AGS).
 *
 * Uses the client_credentials OAuth 2.0 flow to obtain a Canvas
 * access token before posting.
 *
 * Score mapping:
 *   badge_awarded = true  → 1.0
 *   partial pass          → 0.5
 *   not yet meeting       → 0.0
 *
 * TODO: implement Canvas OAuth 2.0 client_credentials token fetch
 * TODO: implement retry with exponential backoff
 */
import axios  from 'axios';
import { logger } from '../eventLogger';
import { EVENTS } from '@cap/shared';
import { USE_LOCAL_DB } from '../../config/env';

export async function postGradeToCanvas(session: any, score: number): Promise<void> {
  // Local dev: no Canvas instance — log the event and return
  if (USE_LOCAL_DB) {
    logger.info(EVENTS.GRADE_POSTED, { sessionId: session.sessionId, score, simulated: true });
    return;
  }
  try {
    // TODO: fetch Canvas access token via client_credentials
    const accessToken = 'TODO_fetch_canvas_token';

    await axios.post(session.agsEndpoint, {
      scoreGiven:    score,
      scoreMaximum:  1.0,
      activityProgress: 'Completed',
      gradingProgress:  'FullyGraded',
      timestamp:     new Date().toISOString(),
      userId:        session.lisResultSourcedId,
    }, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10_000,
    });

    logger.info(EVENTS.GRADE_POSTED, { sessionId: session.sessionId, score });
  } catch (err) {
    logger.error(EVENTS.GRADE_POST_FAILED, { sessionId: session.sessionId, error: String(err) });
    throw err;
  }
}
