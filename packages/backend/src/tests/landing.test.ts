/**
 * landing.test.ts — The landing page's server side.
 *
 * Guarantees:
 *   1. A verified launch lands on /landing by default, and on /launch when
 *      LTI_LANDING_PAGE=off. The token and phase ride along either way.
 *   2. GET /session/status reports the stage of the token's own session:
 *      not_started, in_progress, saved, or ended.
 *   3. It always answers 200, even for a finished or deleted session. The landing page
 *      polls it, and a 404 would make the shared client throw the frame to another page.
 *   4. It reads the session from the token, never from the address, and returns no
 *      identifiers, addresses or answers.
 *
 * Runs on an ephemeral port against the JSON-file store. No AWS, no Canvas.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Server } from 'http';

process.env.USE_LOCAL_DB       = 'true';
process.env.NODE_ENV           = 'production';   // suppress app.listen's dev boot
process.env.SESSION_JWT_SECRET = 'landing-test-secret';
process.env.CAP_LOCAL_DB_FILE  = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'cap-landing-test-')), 'db.json');
process.env.FRONTEND_URL       = 'https://app.example.test';
process.env.LTI_DEFAULT_ACTIVITY_ID = 'sim-sales-process';

const SIM_MODULE = 'sim-sales-process';

let server: Server;
let base: string;
let api: {
  createSession: (ctx: any) => Promise<{ sessionToken: string }>;
  sessionDb: typeof import('../db/sessionDb')['sessionDb'];
  launchLandingPath: () => string;
};

beforeAll(async () => {
  const { app }            = await import('../app');
  const { seedLocalStore } = await import('../db/localStore');
  const { sessionDb }      = await import('../db/sessionDb');
  const orchestrator       = await import('../services/orchestrator/orchestratorService');
  const { launchLandingPath } = await import('../services/lti/ltiService');
  seedLocalStore();
  api = { createSession: orchestrator.createSession as any, sessionDb, launchLandingPath };
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

afterAll(() => { server?.close(); });

const sessionIdOf = (token: string): string =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sessionId;

const newSession = async (learner: string) => {
  const { sessionToken } = await api.createSession({
    canvasUuid: learner, ltiContextId: 'ctx', ltiResourceLinkId: 'link',
    agsEndpoint: 'x', lisResultSourcedId: 'y', moduleId: SIM_MODULE,
  });
  return { token: sessionToken, id: sessionIdOf(sessionToken) };
};

const status = async (token?: string) => {
  const r = await fetch(`${base}/session/status`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: r.status, body: await r.json().catch(() => null) as any };
};

// An unsigned launch token: the launch step does not verify signatures yet (a known
// TODO), and this test is about where the launch ends up, not about the token.
const fakeIdToken = () => {
  const claims = { iss: 'https://canvas.example.test', sub: 'landing-sub-1' };
  return ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
};
const launch = () => fetch(`${base}/lti/launch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ id_token: fakeIdToken(), state: 'x' }).toString(),
  redirect: 'manual',
});

describe('where a launch lands', () => {
  it('goes to the landing page by default, with the token and phase', async () => {
    const r = await launch();
    expect(r.status).toBe(302);
    const location = r.headers.get('location') ?? '';
    expect(location.startsWith('https://app.example.test/landing?token=')).toBe(true);
    expect(new URL(location).searchParams.get('phase')).toBeTruthy();
  });

  it('goes straight to the activity when LTI_LANDING_PAGE=off', async () => {
    process.env.LTI_LANDING_PAGE = 'off';
    try {
      const r = await launch();
      expect((r.headers.get('location') ?? '').startsWith('https://app.example.test/launch?token=')).toBe(true);
      expect(api.launchLandingPath()).toBe('/launch');
    } finally { delete process.env.LTI_LANDING_PAGE; }
    expect(api.launchLandingPath()).toBe('/landing');
  });
});

describe('the server\'s list of student pages', () => {
  // The page routes are only served by name in a deployed build. Dropping one makes a
  // direct load or a refresh of that page a 404 there, while local dev and every other
  // test still pass: this happened with /exit. So read the real routes and compare.
  it('includes every page route in the student app', async () => {
    const { STUDENT_PAGES } = await import('../app');
    const appSource = fs.readFileSync(
      path.resolve(__dirname, '../../../frontend-student/src/App.tsx'), 'utf8');
    const routes = [...appSource.matchAll(/<Route\s+path="\/([^"]*)"/g)].map(m => m[1]);
    const pages = routes.filter(r => r !== '' && r !== '*');
    expect(pages.length).toBeGreaterThan(3);                       // the pattern found the routes
    for (const page of pages) expect(STUDENT_PAGES, `route /${page}`).toContain(page);
  });
});

describe('GET /session/status', () => {
  it('reports a new session as not started', async () => {
    const { token } = await newSession('status-new');
    const r = await status(token);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('not_started');
  });

  it('reports progress past the check-in as in progress, with the stage', async () => {
    const { token, id } = await newSession('status-progress');
    await api.sessionDb.updateSession(id, { state: 'LEARNING', phaseReached: 2 });
    const r = await status(token);
    expect(r.body).toMatchObject({ status: 'in_progress', phaseReached: 2 });
  });

  it('reports a paused session as saved', async () => {
    const { token, id } = await newSession('status-saved');
    await api.sessionDb.updateSession(id, { state: 'SAVED', phaseReached: 2 });
    expect((await status(token)).body.status).toBe('saved');
  });

  it('reports a finished or expired session as ended, with a 200', async () => {
    const { token, id } = await newSession('status-ended');
    for (const state of ['COMPLETED', 'EXPIRED', 'INTERRUPTED']) {
      await api.sessionDb.updateSession(id, { state });
      const r = await status(token);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ status: 'ended' });
    }
  });

  it('reports a deleted session as ended, not as a 404', async () => {
    // Completing a session deletes its record, so this is what a student sees after finishing.
    const { token, id } = await newSession('status-deleted');
    await api.sessionDb.deleteSession(id);
    const r = await status(token);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'ended' });
  });

  it('answers for the token\'s own session, whatever else exists', async () => {
    const a = await newSession('status-own-a');
    const b = await newSession('status-own-b');
    await api.sessionDb.updateSession(b.id, { state: 'LEARNING', phaseReached: 3 });
    expect((await status(a.token)).body.status).toBe('not_started');
    expect((await status(b.token)).body.status).toBe('in_progress');
  });

  it('returns only a status, a stage and an attempt number', async () => {
    const { token, id } = await newSession('status-keys');
    await api.sessionDb.updateSession(id, { state: 'LEARNING', phaseReached: 2 });
    const body = (await status(token)).body;
    expect(Object.keys(body).sort()).toEqual(['attemptNumber', 'phaseReached', 'status']);
  });

  it('needs a token', async () => {
    expect((await status()).status).toBe(401);
  });
});
