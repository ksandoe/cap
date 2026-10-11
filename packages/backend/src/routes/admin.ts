/**
 * admin.ts — Admin App backend routes.
 *
 * All routes require a valid admin JWT (role: author | instructor |
 * researcher | admin). Role-level guards are applied per route group.
 *
 * GET  /admin/sessions             → list sessions for a module (instructor+)
 * GET  /admin/sessions/:id/transcript → get transcript (instructor+)
 * GET  /admin/sessions/export      → CSV export (instructor+)
 * POST /admin/sessions/:id/grant-retry → grant extra retry (instructor+)
 * POST /admin/sessions/:id/review  → submit evaluation review (instructor+)
 *
 * POST /admin/research/query       → query research schema (researcher)
 * POST /admin/research/export      → export dataset (researcher)
 * GET  /admin/research/consent     → consent config (researcher)
 *
 * GET  /admin/module-config/:id    → get module config (admin)
 * POST /admin/module-config        → save module config (admin)
 * GET  /admin/sap-pool/status      → pool status (admin)
 * POST /admin/sap-pool/import      → bulk import accounts (admin)
 * POST /admin/sap-pool/:u/release  → force-release account (admin)
 * POST /admin/audit-log/query      → query audit log (admin)
 * GET  /admin/health               → integration health (admin)
 * GET  /admin/irb-config/:id       → IRB config (admin)
 * POST /admin/irb-config           → save IRB config (admin)
 * POST /admin/auth/login           → admin login (public)
 *
 * /admin/authoring/*               → v3 guided authoring (author|admin):
 *   drafts CRUD, :id/publish, extract-text (file→text), generate (AI draft)
 */
import { Router } from 'express';
import { asyncRouter } from '../middleware/asyncRouter';
import { requireRole }    from '../middleware/requireRole';
import { authMiddleware } from '../middleware/auth';
import * as instructor from '../services/admin/instructorService';
import * as researcher  from '../services/admin/researcherService';
import * as adminSvc    from '../services/admin/adminService';
import * as authoring   from '../services/admin/authoringService';
import * as platform    from '../services/admin/platformService';
import { handleAdminLogin } from '../services/admin/authService';

export const adminRouter = asyncRouter();

// ── Auth (public within admin routes) ────────────────────────────────────────
adminRouter.post('/auth/login', handleAdminLogin);

// Everything below requires a valid admin JWT
adminRouter.use(authMiddleware);

// ── Instructor routes ─────────────────────────────────────────────────────────
adminRouter.get( '/sessions',                    requireRole(['instructor','admin']), instructor.listSessions);
adminRouter.get( '/sessions/export',             requireRole(['instructor','admin']), instructor.exportCsv);
adminRouter.get( '/sessions/:id/transcript',     requireRole(['instructor','admin']), instructor.getTranscript);
adminRouter.post('/sessions/:id/grant-retry',    requireRole(['instructor','admin']), instructor.grantRetry);
adminRouter.post('/sessions/:id/review',         requireRole(['instructor','admin']), instructor.reviewEvaluation);

// De-identified evaluation records (rubric scores + transcripts) — the
// same dataset researchers see post-IRB. No student identifiers exist
// in this store.
adminRouter.get( '/evaluations',                 requireRole(['instructor','researcher','admin']), instructor.listEvaluations);
adminRouter.get( '/evaluations/:id',             requireRole(['instructor','researcher','admin']), instructor.getEvaluation);

// ── Researcher routes ─────────────────────────────────────────────────────────
adminRouter.post('/research/query',              requireRole(['researcher','admin']), researcher.queryResearch);
adminRouter.post('/research/export',             requireRole(['researcher','admin']), researcher.exportResearch);
adminRouter.get( '/research/consent',            requireRole(['researcher','admin']), researcher.getConsentConfig);

// Recipe image uploads — any content role can embed screenshots
adminRouter.post('/images',                       requireRole(['author','instructor','researcher','admin']), adminSvc.uploadImage);

// ── Guided authoring (v3): drafts + AI generation ─────────────────────────────
adminRouter.get(   '/authoring/drafts',            requireRole(['author','admin']), authoring.listDrafts);
adminRouter.post(  '/authoring/drafts',            requireRole(['author','admin']), authoring.createDraft);
adminRouter.get(   '/authoring/drafts/:id',        requireRole(['author','admin']), authoring.getDraft);
adminRouter.put(   '/authoring/drafts/:id',        requireRole(['author','admin']), authoring.updateDraft);
adminRouter.delete('/authoring/drafts/:id',        requireRole(['author','admin']), authoring.deleteDraft);
adminRouter.post(  '/authoring/drafts/:id/publish',requireRole(['author','admin']), authoring.publishDraft);
adminRouter.post(  '/authoring/extract-text',      requireRole(['author','admin']), authoring.extractText);
adminRouter.post(  '/authoring/generate',          requireRole(['author','admin']), authoring.generate);

// ── Admin-only routes ─────────────────────────────────────────────────────────
// Module config (passing thresholds) is tunable by instructors too
adminRouter.get( '/module-config/:id',           requireRole(['instructor','admin']), adminSvc.getModuleConfig);
adminRouter.post('/module-config',               requireRole(['instructor','admin']), adminSvc.saveModuleConfig);
// Platform settings — master rubric override + shared passkey (v3.1).
// The passkey value is never returned, only whether an override is set.
adminRouter.get(   '/platform',                  requireRole(['admin']), platform.getPlatform);
adminRouter.put(   '/platform/rubric',           requireRole(['admin']), platform.saveRubric);
adminRouter.delete('/platform/rubric',           requireRole(['admin']), platform.resetRubric);
adminRouter.put(   '/platform/passkey',          requireRole(['admin']), platform.savePasskey);
adminRouter.delete('/platform/passkey',          requireRole(['admin']), platform.resetPasskey);

adminRouter.get( '/sap-pool/status',             requireRole(['admin']), adminSvc.getSapPoolStatus);
adminRouter.post('/sap-pool/import',             requireRole(['admin']), adminSvc.importSapAccounts);
adminRouter.post('/sap-pool/:username/release',  requireRole(['admin']), adminSvc.releaseSapAccount);
adminRouter.post('/audit-log/query',             requireRole(['admin']), adminSvc.queryAuditLog);
adminRouter.get( '/health',                      requireRole(['admin']), adminSvc.getIntegrationHealth);
adminRouter.get( '/irb-config/:id',              requireRole(['admin']), adminSvc.getIrbConfig);
adminRouter.post('/irb-config',                  requireRole(['admin']), adminSvc.saveIrbConfig);
