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
import { evalDb } from '../../db/evalDb';

/**
 * Evaluation browser — reads the de-identified cap-evaluations store.
 * Records carry no student identifiers by construction; this is the same
 * dataset researchers would see post-IRB.
 */
export async function listEvaluations(req: Request, res: Response): Promise<void> {
  const moduleId = (req.query.moduleId as string) ?? '';
  const records  = await evalDb.listForModule(moduleId);
  // List view omits transcripts — detail view fetches them separately.
  res.json({ evaluations: records
    .map(r => {
      const ev = r.evaluation as any;
      return {
        attemptId:     r.attemptId,
        moduleId:      r.moduleId,
        recipeVersion: r.recipeVersion,
        attemptNumber: r.attemptNumber,
        completedAt:   r.completedAt,
        overallScore:  ev?.overallScore ?? null,
        badgeAwarded:  !!ev?.badgeAwarded,
        dimensions:    (ev?.dimensionRatings ?? []).map((d: any) => d.dimensionName ?? d.dimension ?? d.name ?? '?'),
      };
    })
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
  });
}

export async function getEvaluation(req: Request, res: Response): Promise<void> {
  const rec = await evalDb.getAttempt(req.params.id);
  if (!rec) { res.status(404).json({ error: 'EVALUATION_NOT_FOUND' }); return; }
  res.json(rec);
}

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
