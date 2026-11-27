/**
 * session.ts — Session lifecycle routes
 *
 * GET  /session/status            — Landing-page status for the token's session (always 200)
 * GET  /session/:id               — Get current session state
 * POST /session/:id/checkin       — Submit check-in responses
 * POST /session/:id/verify-sap    — Initiate SAP verification
 * GET  /session/:id/verify-status — Poll SAP verification result
 * POST /session/:id/complete      — Mark session complete (called by assessment service)
 * POST /session/:id/progress      — Persist activity position (step + ticks)
 * POST /session/:id/save          — Student pauses intentionally (SAVED, ~7d)
 * POST /session/:id/retry         — Create retry session (toPhase 2|3)
 */
import { Router } from 'express';
import { asyncRouter } from '../middleware/asyncRouter';
import {
  getSession, submitCheckin, initiateSapVerification,
  getSapVerificationStatus, completeSession, saveSession, createRetry,
  saveProgress, getLandingStatus,
} from '../services/orchestrator/orchestratorService';

export const sessionRouter = asyncRouter();

// Registered before '/:id', or Express reads "status" as a session id.
sessionRouter.get( '/status',            getLandingStatus);
sessionRouter.get( '/:id',               getSession);
sessionRouter.post('/:id/checkin',       submitCheckin);
sessionRouter.post('/:id/verify-sap',    initiateSapVerification);
sessionRouter.get( '/:id/verify-status', getSapVerificationStatus);
sessionRouter.post('/:id/complete',      completeSession);
sessionRouter.post('/:id/progress',      saveProgress);
sessionRouter.post('/:id/save',          saveSession);
sessionRouter.post('/:id/retry',         createRetry);
