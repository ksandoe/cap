/**
 * gradeService.ts
 *
 * Posts a completion score back to Canvas via LTI Advantage
 * Assignment and Grade Services (AGS).
 *
 * Uses the client_credentials OAuth 2.0 flow to obtain a Canvas
 * access token before posting.
 *
 * Score mapping — all-or-nothing completion
 * (docs/decisions/2026-10-canvas-lti-atec.md):
 *   passed (thresholds met) → 1.0
 *   otherwise               → 0.0
 *
 * Write-back is Phase 2 and AGS vs. a scoped Canvas API is still open;
 * this module assumes AGS until that is decided.
 *
 * TODO: implement Canvas OAuth 2.0 client_credentials token fetch
 * TODO: implement retry with exponential backoff
 */
import axios  from 'axios';
import { logger } from '../eventLogger';
import { EVENTS } from '@cap/shared';
import { CANVAS_MODE } from '../../config/env';

export async function postGradeToCanvas(session: any, score: number): Promise<void> {
  // Stub mode: no Canvas instance — log the event and return
  if (CANVAS_MODE === 'stub') {
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
      userId:        session.ltiSub,   // AGS identifies the learner by LTI sub
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
