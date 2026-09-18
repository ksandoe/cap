/**
 * session.ts — Session lifecycle routes
 *
 * GET  /session/:id               — Get current session state
 * POST /session/:id/checkin       — Submit check-in responses
 * POST /session/:id/verify-sap    — Initiate SAP verification
 * GET  /session/:id/verify-status — Poll SAP verification result
 * POST /session/:id/complete      — Mark session complete (called by assessment service)
 * POST /session/:id/retry         — Create retry session
 */
import { Router } from 'express';
import {
  getSession, submitCheckin, initiateSapVerification,
  getSapVerificationStatus, completeSession, createRetry,
} from '../services/orchestrator/orchestratorService';

export const sessionRouter = Router();

sessionRouter.get( '/:id',               getSession);
sessionRouter.post('/:id/checkin',       submitCheckin);
sessionRouter.post('/:id/verify-sap',    initiateSapVerification);
sessionRouter.get( '/:id/verify-status', getSapVerificationStatus);
sessionRouter.post('/:id/complete',      completeSession);
sessionRouter.post('/:id/retry',         createRetry);
