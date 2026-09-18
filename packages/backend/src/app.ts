/**
 * app.ts — Express application entry point (local dev + Lambda)
 *
 * In local dev: started directly by nodemon, listens on PORT.
 * In Lambda:    wrapped by serverless-http in lambda/handler.ts.
 */
import express from 'express';
import { ltiRouter }         from './routes/lti';
import { sessionRouter }     from './routes/session';
import { recipeRouter }      from './routes/recipe';
import { assessmentRouter }  from './routes/assessment';
import { errorHandler }      from './middleware/errorHandler';
import { requestLogger }     from './middleware/requestLogger';
import { authMiddleware }    from './middleware/auth';

export const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ── Public (no session token required) ───────────────────────────────────────
app.use('/lti',              ltiRouter);
app.get('/.well-known/jwks.json', (_req, res) => {
  // TODO: serve platform public JWKS for Canvas verification
  res.json({ keys: [] });
});
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Protected (session token required) ───────────────────────────────────────
app.use('/session',     authMiddleware, sessionRouter);
app.use('/recipe',      authMiddleware, recipeRouter);
app.use('/assessment',  authMiddleware, assessmentRouter);

app.use(errorHandler);

// Local dev server
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3001;
  app.listen(port, () => console.log(`Backend running on http://localhost:${port}`));
}
