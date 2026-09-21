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
import express         from 'express';
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

// ── Public ────────────────────────────────────────────────────────────────────
app.use('/lti', ltiRouter);
app.get('/.well-known/jwks.json', (_req, res) => {
  // TODO: serve platform JWKS for Canvas LTI JWT verification
  res.json({ keys: [] });
});
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── Dev-only routes (simulated LTI launch for local development) ─────────────
if (process.env.NODE_ENV !== 'production') {
  if (USE_LOCAL_DB) {
    require('./db/localStore').seedLocalStore();
    console.log('[dev] USE_LOCAL_DB — JSON-file store active, external calls simulated');
  }
  app.use('/dev', require('./routes/dev').devRouter);
}

// ── Student App routes (session JWT required) ─────────────────────────────────
app.use('/session',    authMiddleware, sessionRouter);
app.use('/assessment', authMiddleware, assessmentRouter);
app.use('/recipe',     authMiddleware, recipeRouter);

// ── Admin App routes (login is public; authMiddleware applied inside router) ──
app.use('/admin',      adminRouter);

app.use(errorHandler);

// Local dev server
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT ?? 3001;
  app.listen(port, () =>
    console.log(`Backend running → http://localhost:${port}`)
  );
}
