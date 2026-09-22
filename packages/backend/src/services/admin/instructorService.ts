/**
 * instructorService.ts — Instructor-facing backend operations.
 *
 * Data sources:
 *   - Active sessions: DynamoDB cap-sessions (ephemeral)
 *   - Transcripts: DynamoDB cap-sessions (in-flight) or Aurora audit_log
 *   - Evaluation reviews: Aurora validation_log
 *
 * NOTE: all responses must be stripped of student PII before returning.
 * Sessions are identified by sessionId only. Canvas UUID is never returned.
 *
 * TODO: implement each handler.
 */
import { Request, Response } from 'express';

export async function listSessions(req: Request, res: Response): Promise<void> {
  // TODO: query DynamoDB for sessions by moduleId
  // Strip: sapUsername, canvasUuid, ltiContextId, lisResultSourcedId, agsEndpoint
  res.status(501).json({ error: 'Not implemented.' });
}

export async function getTranscript(req: Request, res: Response): Promise<void> {
  // TODO: retrieve transcript from DynamoDB session record
  // Only available while session record exists (pre-completion)
  res.status(501).json({ error: 'Not implemented.' });
}

export async function exportCsv(req: Request, res: Response): Promise<void> {
  // TODO: query active sessions, format as CSV, stream response
  // No PII columns. See user story INS-03 for column spec.
  res.status(501).json({ error: 'Not implemented.' });
}

export async function grantRetry(req: Request, res: Response): Promise<void> {
  // TODO: increment retry allowance for sessionId
  // Log action to Aurora audit_log with reason field
  res.status(501).json({ error: 'Not implemented.' });
}

export async function reviewEvaluation(req: Request, res: Response): Promise<void> {
  // TODO: save instructor dimension ratings to Aurora validation_log
  // Flag disagreements for domain expert notification
  res.status(501).json({ error: 'Not implemented.' });
}
