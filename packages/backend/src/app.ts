/**
 * app.ts — Express application entry point.
 *
 * Serves both the Student App and the Admin App from a single backend.
 * Authentication differs by route group:
 *   /lti/*         — public (Canvas-signed JWT, validated by ltiService)
 *   /session/*     — student session JWT (authMiddleware)
 *   /assessment/*  — student session JWT (authMiddleware)
 *   /recipe/*      — student or admin JWT (authMiddleware)
 *   /admin/*       — admin role JWT (authMiddleware + requireRole)
 *
 * In local dev: started directly by tsx watch, listens on PORT (default 3001).
 * In Lambda:    wrapped by serverless-http in lambda/handler.ts.
 */
// config/env must be imported first — it loads .env before other modules read it
import { USE_LOCAL_DB } from './config/env';
import { auroraConfigured } from './db/auroraDb';
import express         from 'express';
import fs              from 'fs';
import path            from 'path';
import { ltiRouter }        from './routes/lti';
import { sessionRouter }    from './routes/session';
import { recipeRouter }     from './routes/recipe';
import { assessmentRouter } from './routes/assessment';
import { adminRouter }      from './routes/admin';
import { errorHandler }     from './middleware/errorHandler';
import { requestLogger }    from './middleware/requestLogger';
import { authMiddleware }   from './middleware/auth';

export const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// CORS — deployed frontends call the API cross-origin. Lock down with
// ALLOWED_ORIGINS (comma-separated); default allows any origin (demo only).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length === 0 || (origin && ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.length ? origin! : '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
});

// ── Public ────────────────────────────────────────────────────────────────────
app.use('/lti', ltiRouter);
app.get('/.well-known/jwks.json', (_req, res) => {
  // TODO: serve platform JWKS for Canvas LTI JWT verification
  res.json({ keys: [] });
});
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── Dev/demo routes (Canvas launchpad; never enable in real production) ──────
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEV_ROUTES === 'true') {
  if (USE_LOCAL_DB || !auroraConfigured()) {
    require('./db/localStore').seedLocalStore();
    console.log('[dev] JSON-file store active (local dev or demo without Aurora)');
  }
  app.use('/dev', require('./routes/dev').devRouter);
}

// ── Student App routes (session JWT required) ─────────────────────────────────
app.use('/session',    authMiddleware, sessionRouter);
app.use('/assessment', authMiddleware, assessmentRouter);
app.use('/recipe',     authMiddleware, recipeRouter);

// ── Admin App routes (login is public; authMiddleware applied inside router) ──
app.use('/admin',      adminRouter);

// ── Static SPA hosting ────────────────────────────────────────────────────────
// In the deployed demo both frontends are bundled alongside the Lambda code
// (public/student, public/admin) and served from the same origin:
//   Student App → /           Admin App → /admin-app/
// In local dev these directories don't exist — Vite serves the apps instead.
const publicDir   = path.join(__dirname, 'public');
const studentDist = path.join(publicDir, 'student');
const adminDist   = path.join(publicDir, 'admin');
if (fs.existsSync(studentDist)) {
  app.use('/admin-app', express.static(adminDist));
  app.get(/^\/admin-app(\/.*)?$/, (_req, res) =>
    res.sendFile(path.join(adminDist, 'index.html')));
  app.use(express.static(studentDist));
  app.get(/^\/(launch|wizard|error)?$/, (_req, res) =>
    res.sendFile(path.join(studentDist, 'index.html')));
}

app.use(errorHandler);

// Local dev server
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT ?? 3001;
  app.listen(port, () =>
    console.log(`Backend running → http://localhost:${port}`)
  );
}
