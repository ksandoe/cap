/**
 * lti.test.ts — LTI login initiation (GET and POST).
 *
 * The LTI standard lets a platform start login with either method, and Canvas is
 * reported to send a POST. Guarantees:
 *   1. GET and POST /lti/oidc/login both redirect to the platform's authorization
 *      endpoint with the same parameters.
 *   2. A request without login_hint, or with a repeated login_hint, is rejected.
 *   3. A server with no LTI settings says so, instead of "Invalid URL".
 *   4. The log line records which parameters arrived, never their values.
 *
 * Runs on an ephemeral port against the JSON-file store — no AWS, no Canvas.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Server } from 'http';

process.env.USE_LOCAL_DB       = 'true';
process.env.NODE_ENV           = 'production';   // suppress app.listen's dev boot
process.env.SESSION_JWT_SECRET = 'lti-test-secret';
process.env.CAP_LOCAL_DB_FILE  = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'cap-lti-test-')), 'db.json');

const AUTH_URL = 'https://platform.example.test/api/lti/authorize_redirect';
const CLIENT   = 'test-client-id';
const REDIRECT = 'https://tool.example.test/lti/launch';
const HINT     = 'canvas-user-hint-12345';

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.LTI_OIDC_AUTH_URL = AUTH_URL;
  process.env.LTI_CLIENT_ID     = CLIENT;
  process.env.LTI_REDIRECT_URI  = REDIRECT;
  const { app } = await import('../app');
  // The launch tests below need the simulator module to exist in the store.
  const { seedLocalStore, localModuleConfigDb } = await import('../db/localStore');
  const { PILOT_ASSIGNMENT } = await import('@cap/sim-engine');
  seedLocalStore();
  await localModuleConfigDb.saveConfig({
    moduleId: 'sim-sales-process', overallMin: 60, dimensionFloor: 40,
    activityKind: 'sim', simAssignmentId: PILOT_ASSIGNMENT.id,
  });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

afterAll(() => { server?.close(); });

const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

/** Expect a redirect to the authorization endpoint and return its parameters. */
function authParams(r: Response): URLSearchParams {
  expect(r.status).toBe(302);
  const location = r.headers.get('location') ?? '';
  expect(location.startsWith(AUTH_URL + '?')).toBe(true);
  return new URL(location).searchParams;
}

describe('POST and GET /lti/oidc/login', () => {
  const fields = { iss: 'https://canvas.example.test', login_hint: HINT, lti_message_hint: 'msg-hint-1' };

  it('redirects a GET to the authorization endpoint', async () => {
    const r = await fetch(`${base}/lti/oidc/login?${form(fields)}`, { redirect: 'manual' });
    const p = authParams(r);
    expect(p.get('login_hint')).toBe(HINT);
    expect(p.get('lti_message_hint')).toBe('msg-hint-1');
    expect(p.get('client_id')).toBe(CLIENT);
    expect(p.get('redirect_uri')).toBe(REDIRECT);
    expect(p.get('response_type')).toBe('id_token');
    expect(p.get('response_mode')).toBe('form_post');
    expect(p.get('scope')).toBe('openid');
    expect(p.get('prompt')).toBe('none');
    expect(p.get('state')).toBeTruthy();
    expect(p.get('nonce')).toBeTruthy();
  });

  it('redirects a form POST the same way', async () => {
    const r = await fetch(`${base}/lti/oidc/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form(fields),
      redirect: 'manual',
    });
    const p = authParams(r);
    expect(p.get('login_hint')).toBe(HINT);
    expect(p.get('lti_message_hint')).toBe('msg-hint-1');
    expect(p.get('client_id')).toBe(CLIENT);
    expect(p.get('redirect_uri')).toBe(REDIRECT);
  });

  it('leaves out lti_message_hint when the platform sent none', async () => {
    const r = await fetch(`${base}/lti/oidc/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ iss: fields.iss, login_hint: HINT }),
      redirect: 'manual',
    });
    expect(authParams(r).has('lti_message_hint')).toBe(false);
  });

  it('rejects a request without login_hint', async () => {
    const r = await fetch(`${base}/lti/oidc/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ iss: fields.iss }),
      redirect: 'manual',
    });
    expect(r.status).toBe(400);
    expect(((await r.json()) as any).error.code).toBe('LTI_BAD_LOGIN_REQUEST');
  });

  it('rejects a repeated login_hint instead of guessing', async () => {
    const r = await fetch(`${base}/lti/oidc/login?login_hint=a&login_hint=b`, { redirect: 'manual' });
    expect(r.status).toBe(400);
  });
});

describe('server without LTI settings', () => {
  it('says LTI is not configured', async () => {
    const saved = process.env.LTI_OIDC_AUTH_URL;
    delete process.env.LTI_OIDC_AUTH_URL;
    try {
      const r = await fetch(`${base}/lti/oidc/login?login_hint=${HINT}`, { redirect: 'manual' });
      expect(r.status).toBe(500);
      expect(((await r.json()) as any).error.code).toBe('LTI_NOT_CONFIGURED');
    } finally {
      process.env.LTI_OIDC_AUTH_URL = saved;
    }
  });
});

describe('logging', () => {
  it('records which parameters arrived, never their values', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await fetch(`${base}/lti/oidc/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ iss: 'https://canvas.example.test', login_hint: HINT, lti_message_hint: 'secret-msg-hint' }),
        redirect: 'manual',
      });
      const printed = JSON.stringify(spy.mock.calls);
      expect(printed).toContain('LTI_LAUNCH_RECEIVED');
      expect(printed).toContain('login_hint');          // the name is logged
      expect(printed).not.toContain(HINT);              // the value is not
      expect(printed).not.toContain('secret-msg-hint');
    } finally {
      spy.mockRestore();
    }
  });
});

// ── Which activity a launch opens ─────────────────────────────────────────────
// The launch token is not yet signature-checked (a known TODO), so these tests
// hand the server an unsigned token. They cover only the choice of activity.
const CUSTOM_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/custom';

const fakeIdToken = (custom?: Record<string, unknown>) => {
  const claims = {
    iss: 'https://canvas.example.test',
    sub: 'student-sub-1',
    'https://purl.imsglobal.org/spec/lti/claim/context': { id: 'ctx-1' },
    'https://purl.imsglobal.org/spec/lti/claim/resource_link': { id: 'link-1' },
    ...(custom ? { [CUSTOM_CLAIM]: custom } : {}),
  };
  return ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
};

const launch = (custom?: Record<string, unknown>) => fetch(`${base}/lti/launch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: form({ id_token: fakeIdToken(custom), state: 'x' }),
  redirect: 'manual',
});

/** Run `body` with LTI_DEFAULT_ACTIVITY_ID set (or removed), then restore it. */
async function withDefaultActivity(value: string | undefined, body: () => Promise<void>) {
  const saved = process.env.LTI_DEFAULT_ACTIVITY_ID;
  if (value === undefined) delete process.env.LTI_DEFAULT_ACTIVITY_ID;
  else process.env.LTI_DEFAULT_ACTIVITY_ID = value;
  try { await body(); }
  finally {
    if (saved === undefined) delete process.env.LTI_DEFAULT_ACTIVITY_ID;
    else process.env.LTI_DEFAULT_ACTIVITY_ID = saved;
  }
}

describe('resolveActivityId', () => {
  it('prefers the launch parameter over the server default', async () => {
    const { resolveActivityId } = await import('../services/lti/ltiService');
    await withDefaultActivity('default-activity', async () => {
      expect(resolveActivityId({ activity_id: 'from-launch' })).toBe('from-launch');
      expect(resolveActivityId({ module_id: 'legacy-name' })).toBe('legacy-name');
    });
  });

  it('falls back to the server default, and to nothing when neither is set', async () => {
    const { resolveActivityId } = await import('../services/lti/ltiService');
    await withDefaultActivity('default-activity', async () => {
      expect(resolveActivityId({})).toBe('default-activity');
      expect(resolveActivityId({ activity_id: '   ' })).toBe('default-activity');
    });
    await withDefaultActivity(undefined, async () => {
      expect(resolveActivityId({})).toBeUndefined();
    });
  });
});

describe('POST /lti/launch', () => {
  it('opens the default activity when Canvas sends no custom parameter', async () => {
    await withDefaultActivity('sim-sales-process', async () => {
      const r = await launch();
      expect(r.status).toBe(302);
      expect(r.headers.get('location') ?? '').toContain('/launch?token=');
    });
  });

  it('fails when there is neither a custom parameter nor a default', async () => {
    await withDefaultActivity(undefined, async () => {
      expect((await launch()).status).toBe(400);
    });
  });

  it('keeps the activity the launch names instead of swapping in the default', async () => {
    await withDefaultActivity('sim-sales-process', async () => {
      const r = await launch({ activity_id: 'other-activity' });
      expect(r.status).toBe(302);
      const token = new URL(r.headers.get('location') ?? '').searchParams.get('token') ?? '';
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      expect(payload.moduleId).toBe('other-activity');
    });
  });
});
