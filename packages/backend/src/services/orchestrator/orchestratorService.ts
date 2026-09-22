/**
 * orchestratorService.ts
 *
 * Central workflow coordinator. Owns:
 *   - Session creation from LTI context
 *   - Phase gate enforcement
 *   - SAP verification initiation and polling
 *   - Post-completion workflow (grade + badge)
 *   - Retry session creation
 *
 * All session state lives in DynamoDB (cap-sessions) with a TTL
 * equal to the session expiry. On completion the record is destroyed
 * immediately after grade return and badge issuance succeed.
 */
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { generateTempUserId } from '../identity/tempUser';
import { issueSessionToken }  from '../identity/sessionToken';
import { acquireSapAccount, releaseSapAccount } from '../sap/sapPool';
import { verifySapDocuments } from '../sap/sapConnector';
import { postGradeToCanvas }  from '../grade/gradeService';
import { issueBadge }         from '../badge/badgeService';
import { sessionDb }          from '../../db/sessionDb';
import { recipeDb }           from '../../db/recipeDb';
import { logger }             from '../eventLogger';
import { EVENTS, PHASES }     from '@cap/shared';

// ── Session creation (called from ltiService after JWT validation) ────────────

export async function createSession(ltiContext: {
  canvasUuid: string; ltiContextId: string; ltiResourceLinkId: string;
  agsEndpoint: string; lisResultSourcedId: string; moduleId: string;
}): Promise<{ sessionToken: string; redirectPhase: number }> {

  // Check for an existing resumable session
  const existing = await sessionDb.findActiveSession(ltiContext.canvasUuid, ltiContext.moduleId);
  if (existing) {
    logger.info(EVENTS.SESSION_RESUMED, { sessionId: existing.sessionId, phase: existing.phaseReached });
    const token = await issueSessionToken({
      sessionId: existing.sessionId, tempUserId: existing.tempUserId,
      moduleId: existing.moduleId,   currentPhase: existing.phaseReached,
      canvasUuid: existing.canvasUuid,
    });
    return { sessionToken: token, redirectPhase: existing.phaseReached };
  }

  // Assign a SAP account from the pool
  const sessionId  = uuidv4();
  const tempUserId = generateTempUserId();
  const sapUsername = await acquireSapAccount(sessionId);
  const now         = new Date().toISOString();
  const ttlSeconds  = parseInt(process.env.SESSION_TTL_HOURS ?? '8', 10) * 3600;

  // Resolve the active recipe for this module (module config lookup TODO: cap-modules table)
  const recipe = await recipeDb.getActiveRecipe(ltiContext.moduleId);

  const session = {
    sessionId, tempUserId, moduleId: ltiContext.moduleId,
    recipeId:      recipe?.recipeId ?? null,
    recipeVersion: recipe?.version  ?? 1,
    state:      'LAUNCHED' as const,
    phaseReached: PHASES.CHECKIN,
    attemptNumber: 1,
    completedBlockIds: [] as string[],
    canvasUuid:         ltiContext.canvasUuid,   // server-side only — resume lookup
    ltiContextId:       ltiContext.ltiContextId,
    ltiResourceLinkId:  ltiContext.ltiResourceLinkId,
    agsEndpoint:        ltiContext.agsEndpoint,
    lisResultSourcedId: ltiContext.lisResultSourcedId,
    sapUsername,          // server-side only — never sent to browser
    startedAt: now,
    ttl: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  await sessionDb.putSession(session);
  logger.info(EVENTS.SESSION_CREATED, { sessionId, moduleId: ltiContext.moduleId });
  logger.info(EVENTS.SAP_USER_ASSIGNED, { sessionId, sapUsername });

  const token = await issueSessionToken({
    sessionId, tempUserId, moduleId: ltiContext.moduleId,
    currentPhase: PHASES.CHECKIN, canvasUuid: ltiContext.canvasUuid,
  });

  return { sessionToken: token, redirectPhase: PHASES.CHECKIN };
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function getSession(req: Request, res: Response): Promise<void> {
  const session = await sessionDb.getSession(req.params.id);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }
  // Strip server-side-only fields before returning to browser
  const { sapUsername: _sap, canvasUuid: _cu, ...safeSession } = session as any;
  res.json(safeSession);
}

export async function submitCheckin(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { responses } = req.body;

  await sessionDb.updateSession(id, {
    state: 'LEARNING', phaseReached: PHASES.ACTIVITY,
    checkinResponses: responses,
  });

  logger.info(EVENTS.CHECKIN_COMPLETED, { sessionId: id, questionCount: responses.length });
  res.json({ ok: true, nextPhase: PHASES.ACTIVITY });
}

export async function initiateSapVerification(req: Request, res: Response): Promise<void> {
  const session = await sessionDb.getSession(req.params.id);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }

  await sessionDb.updateSession(req.params.id, { state: 'SAP_PENDING' });
  logger.info(EVENTS.SAP_VERIFICATION_START, { sessionId: req.params.id });

  // Fire-and-forget — client polls verify-status
  runSapVerification(req.params.id, session.sapUsername!, session.moduleId).catch(console.error);

  res.json({ ok: true, status: 'SAP_PENDING' });
}

async function runSapVerification(sessionId: string, sapUsername: string, moduleId: string) {
  try {
    // TODO: load requiredDocTypes from module config
    const requiredDocTypes = ['VA11', 'VA21', 'VA01'];
    const result = await verifySapDocuments(sapUsername, requiredDocTypes);

    if (result.allPresent) {
      await sessionDb.updateSession(sessionId, {
        state: 'SAP_VERIFIED', phaseReached: PHASES.CHECKOUT,
        sapVerifiedAt: new Date().toISOString(), sapDocRefs: result.foundDocs,
      });
      logger.info(EVENTS.SAP_VERIFICATION_PASS, { sessionId, docs: result.foundDocs });
    } else {
      await sessionDb.updateSession(sessionId, { state: 'LEARNING', sapVerificationError: { missingTypes: result.missingTypes } });
      logger.warn(EVENTS.SAP_VERIFICATION_FAIL, { sessionId, missingTypes: result.missingTypes });
    }
  } catch (err) {
    await sessionDb.updateSession(sessionId, { state: 'LEARNING', sapVerificationError: { error: String(err) } });
    logger.error(EVENTS.SAP_VERIFICATION_ERROR, { sessionId, error: String(err) });
  }
}

export async function getSapVerificationStatus(req: Request, res: Response): Promise<void> {
  const session = await sessionDb.getSession(req.params.id);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }
  res.json({ status: session.state, sapVerificationError: (session as any).sapVerificationError });
}

export async function completeSession(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { evaluation } = req.body;
  const session = await sessionDb.getSession(id);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }

  const now = new Date().toISOString();
  await sessionDb.updateSession(id, { state: 'COMPLETED', completedAt: now });
  logger.info(EVENTS.ASSESSMENT_COMPLETE, { sessionId: id, badgeAwarded: evaluation.badgeAwarded });

  // Post-completion workflow (parallel where possible)
  const ratings = evaluation.dimensionRatings ?? evaluation.dimensions ?? [];
  const score = evaluation.badgeAwarded ? 1.0
    : ratings.some((d: any) => d.rating !== 'Needs further work') ? 0.5 : 0.0;

  await Promise.allSettled([
    postGradeToCanvas(session, score),
    evaluation.badgeAwarded ? issueBadge(session) : Promise.resolve(),
  ]);

  // Release SAP account back to pool
  if (session.sapUsername) {
    await releaseSapAccount(session.sapUsername);
    logger.info(EVENTS.SAP_USER_RELEASED, { sessionId: id, sapUsername: session.sapUsername });
  }

  // Destroy session record (FERPA — no persistent student data)
  await sessionDb.deleteSession(id);
  logger.info(EVENTS.SESSION_COMPLETED, { sessionId: id, score, badgeAwarded: evaluation.badgeAwarded });

  res.json({ ok: true });
}

export async function createRetry(req: Request, res: Response): Promise<void> {
  // The parent session may already be deleted (sessions are destroyed on
  // completion). Fall back to the session-token claims + request body.
  const parent = await sessionDb.getSession(req.params.id);
  const claims = req.session!;

  if (!parent && claims.sessionId !== req.params.id) {
    res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    return;
  }

  // TODO: enforce retry limit from module config
  const newSessionId = uuidv4();
  const ttlSeconds   = parseInt(process.env.SESSION_TTL_HOURS ?? '8', 10) * 3600;
  const sapUsername  = await acquireSapAccount(newSessionId);

  const retrySession = {
    ...(parent ?? {}),
    sessionId:         newSessionId,
    tempUserId:        parent?.tempUserId ?? claims.tempUserId,
    moduleId:          parent?.moduleId   ?? claims.moduleId,
    canvasUuid:        parent?.canvasUuid ?? claims.canvasUuid,
    state:             'SAP_VERIFIED' as const, // skip SAP gate on retry
    phaseReached:      PHASES.CHECKOUT,
    attemptNumber:     (parent?.attemptNumber ?? req.body.attemptNumber ?? 1) + 1,
    priorSessionId:    req.params.id,
    sapUsername,
    completedBlockIds: parent?.completedBlockIds ?? [],
    startedAt:         new Date().toISOString(),
    completedAt:       undefined,
    transcript:        undefined,
    evaluation:        undefined,
    sapVerificationError: undefined,
    ttl:               Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  await sessionDb.putSession(retrySession);
  logger.info(EVENTS.RETRY_CREATED, { sessionId: newSessionId, priorSessionId: req.params.id });

  const token = await issueSessionToken({
    sessionId: newSessionId, tempUserId: retrySession.tempUserId,
    moduleId: retrySession.moduleId, currentPhase: PHASES.CHECKOUT,
    canvasUuid: retrySession.canvasUuid,
  });

  res.json({ sessionToken: token, redirectPhase: PHASES.CHECKOUT });
}
