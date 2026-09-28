/**
 * orchestratorService.ts
 *
 * Central workflow coordinator. Owns:
 *   - Session creation from LTI context
 *   - Phase gate enforcement
 *   - SAP verification initiation and polling
 *   - Save / resume lifecycle (SAVED state)
 *   - Stale-session sweep (INTERRUPTED — releases held SAP accounts)
 *   - Post-completion workflow (grade + badge + account release)
 *   - Retry session creation
 *
 * Session states per the lifecycle table:
 *   in-progress (LAUNCHED/LEARNING/SAP_PENDING/SAP_VERIFIED/CHECKOUT)
 *     — student actively working; SAP account held; swept after 24h idle
 *   SAVED       — student paused intentionally; account held ~7 days
 *   INTERRUPTED — idle timeout; SAP account reset (stub) + released
 *   COMPLETED   — verified + done; evidence captured, account released
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
import { paramDb }            from '../../db/paramDb';
import { moduleConfigDb, DEFAULT_THRESHOLDS } from '../../db/moduleConfigDb';
import { evalDb }             from '../../db/evalDb';
import { logger }             from '../eventLogger';
import { EVENTS, PHASES }     from '@cap/shared';

const SESSION_TTL_HOURS   = parseInt(process.env.SESSION_TTL_HOURS ?? '8', 10);
const SAVED_TTL_DAYS      = parseInt(process.env.SAVED_TTL_DAYS ?? '7', 10);
const INTERRUPT_AFTER_HRS = 24;

const now = () => new Date().toISOString();
const ttlIn = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

/** In-progress states — an idle session in one of these holds a SAP account. */
const IN_PROGRESS = new Set(['LAUNCHED', 'LEARNING', 'SAP_PENDING', 'SAP_VERIFIED', 'CHECKIN', 'CHECKOUT', 'EVALUATING']);

/** The in-progress state to resume into, derived from how far the student got. */
function stateForPhase(phase: number): string {
  if (phase >= PHASES.CHECKOUT) return 'SAP_VERIFIED';
  if (phase === PHASES.ACTIVITY) return 'LEARNING';
  return 'LAUNCHED';
}

// ── Session creation (called from ltiService after JWT validation) ────────────

export async function createSession(ltiContext: {
  canvasUuid: string; ltiContextId: string; ltiResourceLinkId: string;
  agsEndpoint: string; lisResultSourcedId: string; moduleId: string;
}, opts: { sessionKey?: string } = {}): Promise<{ sessionToken: string; redirectPhase: number; sessionKey: string }> {

  // Resume path 1 — opaque session key. In production this is the value
  // CAP writes to the Canvas grade column (invisible to the student) via
  // AGS; on relaunch the platform sends it back and it reconnects the
  // launch to this session record without exposing student identity.
  // In dev, the launchpad plays Canvas's role and passes ?key=.
  let existing: any = null;
  if (opts.sessionKey) {
    existing = await sessionDb.findBySessionKey(opts.sessionKey);
    // A key is only authoritative for its own module — a stale/foreign key
    // must not hijack a different module's session.
    if (existing && existing.moduleId !== ltiContext.moduleId) existing = null;
    if (existing) logger.info(EVENTS.SESSION_RESUMED, { sessionId: existing.sessionId, via: 'sessionKey' });
  }

  // Resume path 2 — fallback identity lookup (includes SAVED — a paused
  // session is resumable while its account is still held)
  if (!existing)
    existing = await sessionDb.findActiveSession(ltiContext.canvasUuid, ltiContext.moduleId);

  if (existing) {
    const updates: Record<string, unknown> = { lastActivityAt: now() };
    // Backfill — sessions created before sessionKey existed get one on
    // first resume so every live session has a resume link.
    if (!existing.sessionKey) updates.sessionKey = `sk-${uuidv4()}`;
    // Refresh the parameter binding from the account's current param row —
    // values belong to the pooled account, so a recipe/params update since
    // the session was created should be picked up rather than leaving
    // literal {key} placeholders for the student.
    if (existing.sapUsername) {
      const params = await paramDb.getParams(existing.moduleId, existing.sapUsername);
      if (JSON.stringify(params) !== JSON.stringify(existing.parameters))
        updates.parameters = params;
    }
    if (existing.state === 'SAVED') {
      updates.state = stateForPhase(existing.phaseReached);
      updates.ttl   = ttlIn(SESSION_TTL_HOURS * 3600);
      delete existing.savedAt;
    }
    await sessionDb.updateSession(existing.sessionId, updates);
    logger.info(EVENTS.SESSION_RESUMED, { sessionId: existing.sessionId, phase: existing.phaseReached, wasSaved: existing.state === 'SAVED' });
    const token = await issueSessionToken({
      sessionId: existing.sessionId, tempUserId: existing.tempUserId,
      moduleId: existing.moduleId,   currentPhase: existing.phaseReached,
      canvasUuid: existing.canvasUuid,
    });
    return { sessionToken: token, redirectPhase: existing.phaseReached,
             sessionKey: (updates.sessionKey ?? existing.sessionKey) as string };
  }

  // Reclaim accounts held by dead sessions before taking a fresh one
  await sweepStaleSessions();

  // Assign a SAP account from the pool + bind its parameter row
  const sessionId  = uuidv4();
  const tempUserId = generateTempUserId();
  const sapUsername = await acquireSapAccount(sessionId);
  const parameters  = await paramDb.getParams(ltiContext.moduleId, sapUsername);
  if (!Object.keys(parameters).length)
    logger.warn(EVENTS.PARAMS_MISSING, { moduleId: ltiContext.moduleId, sapUsername });
  const started     = now();

  // Resolve the active recipe for this module (module config lookup TODO: cap-modules table)
  const recipe = await recipeDb.getActiveRecipe(ltiContext.moduleId);

  const session = {
    sessionId, tempUserId, moduleId: ltiContext.moduleId,
    // Opaque resume key — returned to the platform (Canvas grade column in
    // production, launchpad localStorage in dev) so an interrupted/saved
    // session reconnects without carrying any student identifier.
    sessionKey:    `sk-${uuidv4()}`,
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
    parameters,           // this student's assigned values ({key} placeholders)
    startedAt: started,
    lastActivityAt: started,
    ttl: ttlIn(SESSION_TTL_HOURS * 3600),
  };

  await sessionDb.putSession(session);
  logger.info(EVENTS.SESSION_CREATED, { sessionId, moduleId: ltiContext.moduleId });
  logger.info(EVENTS.SAP_USER_ASSIGNED, { sessionId, sapUsername });

  const token = await issueSessionToken({
    sessionId, tempUserId, moduleId: ltiContext.moduleId,
    currentPhase: PHASES.CHECKIN, canvasUuid: ltiContext.canvasUuid,
  });

  return { sessionToken: token, redirectPhase: PHASES.CHECKIN, sessionKey: session.sessionKey };
}

// ── Stale-session sweep ───────────────────────────────────────────────────────
//
// Lazy sweeper — runs inside createSession before a pool claim, which is the
// only place exhaustion hurts. An in-progress session idle for 24h is
// INTERRUPTED and its SAP account released; a SAVED session idle for 7 days
// gets the same treatment. (A scheduled Lambda can call this later.)

async function sweepStaleSessions(): Promise<void> {
  const sessions   = await sessionDb.listSessions();
  const nowMs      = Date.now();
  const staleMs    = INTERRUPT_AFTER_HRS * 3600 * 1000;
  const savedMaxMs = SAVED_TTL_DAYS * 24 * 3600 * 1000;

  for (const s of sessions as any[]) {
    const stale =
      (IN_PROGRESS.has(s.state) && nowMs - Date.parse(s.lastActivityAt ?? s.startedAt) > staleMs) ||
      (s.state === 'SAVED'       && nowMs - Date.parse(s.savedAt ?? s.lastActivityAt ?? s.startedAt) > savedMaxMs);
    if (!stale) continue;

    await sessionDb.updateSession(s.sessionId, { state: 'INTERRUPTED' });
    logger.info(EVENTS.SESSION_INTERRUPTED, { sessionId: s.sessionId, priorState: s.state });
    if (s.sapUsername) {
      await releaseSapAccount(s.sapUsername);
      logger.info(EVENTS.SAP_USER_RELEASED, { sessionId: s.sessionId, sapUsername: s.sapUsername, reason: 'interrupted' });
    }
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function getSession(req: Request, res: Response): Promise<void> {
  const session = await sessionDb.getSession(req.params.id);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }
  // Strip server-side-only fields before returning to browser.
  // `parameters` stays — they are this student's own assignment values.
  const { sapUsername: _sap, canvasUuid: _cu, ...safeSession } = session as any;
  res.json(safeSession);
}

export async function submitCheckin(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { responses } = req.body;

  await sessionDb.updateSession(id, {
    state: 'LEARNING', phaseReached: PHASES.ACTIVITY,
    checkinResponses: responses,
    lastActivityAt: now(),
  });

  logger.info(EVENTS.CHECKIN_COMPLETED, { sessionId: id, questionCount: responses.length });
  res.json({ ok: true, nextPhase: PHASES.ACTIVITY });
}

export async function initiateSapVerification(req: Request, res: Response): Promise<void> {
  const session = await sessionDb.getSession(req.params.id);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }

  await sessionDb.updateSession(req.params.id, { state: 'SAP_PENDING', lastActivityAt: now() });
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
        sapVerifiedAt: now(), sapDocRefs: result.foundDocs,
        lastActivityAt: now(),
      });
      logger.info(EVENTS.SAP_VERIFICATION_PASS, { sessionId, docs: result.foundDocs });
    } else {
      await sessionDb.updateSession(sessionId, { state: 'LEARNING', sapVerificationError: { missingTypes: result.missingTypes }, lastActivityAt: now() });
      logger.warn(EVENTS.SAP_VERIFICATION_FAIL, { sessionId, missingTypes: result.missingTypes });
    }
  } catch (err) {
    await sessionDb.updateSession(sessionId, { state: 'LEARNING', sapVerificationError: { error: String(err) }, lastActivityAt: now() });
    logger.error(EVENTS.SAP_VERIFICATION_ERROR, { sessionId, error: String(err) });
  }
}

export async function getSapVerificationStatus(req: Request, res: Response): Promise<void> {
  const session = await sessionDb.getSession(req.params.id);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }
  res.json({ status: session.state, sapVerificationError: (session as any).sapVerificationError });
}

// Lightweight progress checkpoint — the student app posts here on each
// step advance / instruction toggle, so an interrupted OR explicitly
// saved session restores exact position (step + ticked items), not just
// the coarse phase.
export async function saveProgress(req: Request, res: Response): Promise<void> {
  const session = await sessionDb.getSession(req.params.id);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }
  const { activityStep, instructionDone } = req.body ?? {};
  await sessionDb.updateSession(req.params.id, {
    ...(typeof activityStep === 'number' ? { activityStep } : {}),
    ...(instructionDone ? { instructionDone } : {}),
    lastActivityAt: now(),
  });
  res.json({ ok: true });
}

export async function saveSession(req: Request, res: Response): Promise<void> {
  const session = await sessionDb.getSession(req.params.id);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }
  if (session.state === 'COMPLETED') { res.status(409).json({ error: 'SESSION_ALREADY_COMPLETED' }); return; }

  await sessionDb.updateSession(req.params.id, {
    state: 'SAVED', savedAt: now(), lastActivityAt: now(),
    ttl: ttlIn(SAVED_TTL_DAYS * 24 * 3600),
  });
  logger.info(EVENTS.SESSION_SAVED, { sessionId: req.params.id });
  // The SAP account stays assigned — resume via relaunch within SAVED_TTL_DAYS.
  // sessionKey is returned so the platform-side record (Canvas grade column;
  // launchpad localStorage in dev) holds the resume link.
  res.json({ ok: true, resumeWithinDays: SAVED_TTL_DAYS, sessionKey: (session as any).sessionKey });
}

export async function completeSession(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { evaluation, transcript } = req.body;
  const session = await sessionDb.getSession(id);
  if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }

  // Recompute the verdict from the numeric scores + module thresholds —
  // the posted evaluation is client-supplied, so badgeAwarded must be
  // authoritative server-side.
  const ratings = evaluation.dimensionRatings ?? evaluation.dimensions ?? [];
  const cfg = await moduleConfigDb.getConfig(session.moduleId)
    .catch(() => ({ moduleId: session.moduleId, ...DEFAULT_THRESHOLDS }));
  const overallScore = typeof evaluation.overallScore === 'number'
    ? evaluation.overallScore
    : ratings.length
      ? Math.round(ratings.reduce((a: number, d: any) => a + (d.score ?? 0), 0) / ratings.length)
      : 0;
  const badgeAwarded = overallScore >= cfg.overallMin
    && ratings.every((d: any) => (d.score ?? 0) >= cfg.dimensionFloor);

  await sessionDb.updateSession(id, { state: 'COMPLETED', completedAt: now() });
  logger.info(EVENTS.ASSESSMENT_COMPLETE, { sessionId: id, badgeAwarded, overallScore });

  // Persist the de-identified attempt for research + threshold tuning before
  // the session record is destroyed. No canvasUuid/tempUserId is stored.
  await evalDb.saveAttempt({
    attemptId:     id,
    moduleId:      session.moduleId,
    recipeVersion: (session as any).recipeVersion ?? 1,
    attemptNumber: (session as any).attemptNumber ?? 1,
    evaluation:    { ...evaluation, overallScore, badgeAwarded },
    transcript:    (transcript ?? []).filter((t: any) => !t.hidden)
                     .map(({ role, content }: any) => ({ role, content })),
    completedAt:   now(),
  }).catch(err => logger.error('EVAL_RECORD_FAILED', { sessionId: id, error: String(err) }));

  // Post-completion workflow (parallel where possible)
  const score = badgeAwarded ? 1.0
    : ratings.some((d: any) => d.rating !== 'Needs further work') ? 0.5 : 0.0;

  await Promise.allSettled([
    postGradeToCanvas(session, score),
    badgeAwarded ? issueBadge(session) : Promise.resolve(),
  ]);

  // Release SAP account back to pool (reset is a stub until real SAP lands)
  if (session.sapUsername) {
    await releaseSapAccount(session.sapUsername);
    logger.info(EVENTS.SAP_USER_RELEASED, { sessionId: id, sapUsername: session.sapUsername });
  }

  // Destroy session record (FERPA — no persistent student data)
  await sessionDb.deleteSession(id);
  logger.info(EVENTS.SESSION_COMPLETED, { sessionId: id, score, badgeAwarded });

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

  // If the parent is still alive it still holds a SAP account — release it
  // so a retry of an in-progress session can't leak a pool slot.
  if (parent?.sapUsername) {
    await releaseSapAccount(parent.sapUsername);
    await sessionDb.updateSession(req.params.id, { state: 'INTERRUPTED' });
  }

  // Remediation target: retry the conversation (default) or revisit the
  // activity and re-verify. Either way it's a fresh session + fresh account.
  const toPhase    = req.body?.toPhase === PHASES.ACTIVITY ? PHASES.ACTIVITY : PHASES.CHECKOUT;
  const moduleId   = parent?.moduleId ?? claims.moduleId;

  // TODO: enforce retry limit from module config
  const newSessionId = uuidv4();
  const sapUsername  = await acquireSapAccount(newSessionId);
  const parameters   = await paramDb.getParams(moduleId, sapUsername);

  const retrySession = {
    ...(parent ?? {}),
    sessionId:         newSessionId,
    sessionKey:        `sk-${uuidv4()}`,   // fresh key — the parent's key stays with the dead session
    tempUserId:        parent?.tempUserId ?? claims.tempUserId,
    moduleId,
    canvasUuid:        parent?.canvasUuid ?? claims.canvasUuid,
    state:             toPhase === PHASES.CHECKOUT ? 'SAP_VERIFIED' as const : 'LEARNING' as const,
    phaseReached:      toPhase,
    attemptNumber:     (parent?.attemptNumber ?? req.body.attemptNumber ?? 1) + 1,
    priorSessionId:    req.params.id,
    sapUsername,
    parameters,
    completedBlockIds: toPhase === PHASES.CHECKOUT ? (parent?.completedBlockIds ?? []) : [],
    startedAt:         now(),
    lastActivityAt:    now(),
    savedAt:           undefined,
    completedAt:       undefined,
    transcript:        undefined,
    activityStep:      undefined,
    instructionDone:   undefined,
    evaluation:        undefined,
    sapVerificationError: undefined,
    ttl:               ttlIn(SESSION_TTL_HOURS * 3600),
  };

  await sessionDb.putSession(retrySession);
  logger.info(EVENTS.RETRY_CREATED, { sessionId: newSessionId, priorSessionId: req.params.id, toPhase });

  const token = await issueSessionToken({
    sessionId: newSessionId, tempUserId: retrySession.tempUserId,
    moduleId: retrySession.moduleId, currentPhase: toPhase,
    canvasUuid: retrySession.canvasUuid,
  });

  res.json({ sessionToken: token, redirectPhase: toPhase, sessionKey: retrySession.sessionKey });
}
