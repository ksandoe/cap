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
 */
import { Router } from 'express';
import { requireRole }    from '../middleware/requireRole';
import { authMiddleware } from '../middleware/auth';
import * as instructor from '../services/admin/instructorService';
import * as researcher  from '../services/admin/researcherService';
import * as adminSvc    from '../services/admin/adminService';
import { handleAdminLogin } from '../services/admin/authService';

export const adminRouter = Router();

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

// ── Researcher routes ─────────────────────────────────────────────────────────
adminRouter.post('/research/query',              requireRole(['researcher','admin']), researcher.queryResearch);
adminRouter.post('/research/export',             requireRole(['researcher','admin']), researcher.exportResearch);
adminRouter.get( '/research/consent',            requireRole(['researcher','admin']), researcher.getConsentConfig);

// ── Admin-only routes ─────────────────────────────────────────────────────────
adminRouter.get( '/module-config/:id',           requireRole(['admin']), adminSvc.getModuleConfig);
adminRouter.post('/module-config',               requireRole(['admin']), adminSvc.saveModuleConfig);
adminRouter.get( '/sap-pool/status',             requireRole(['admin']), adminSvc.getSapPoolStatus);
adminRouter.post('/sap-pool/import',             requireRole(['admin']), adminSvc.importSapAccounts);
adminRouter.post('/sap-pool/:username/release',  requireRole(['admin']), adminSvc.releaseSapAccount);
adminRouter.post('/audit-log/query',             requireRole(['admin']), adminSvc.queryAuditLog);
adminRouter.get( '/health',                      requireRole(['admin']), adminSvc.getIntegrationHealth);
adminRouter.get( '/irb-config/:id',              requireRole(['admin']), adminSvc.getIrbConfig);
adminRouter.post('/irb-config',                  requireRole(['admin']), adminSvc.saveIrbConfig);
