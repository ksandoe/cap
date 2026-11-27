/**
 * secrets.test.ts — Secrets with a built-in default work only in local development.
 *
 * SESSION_JWT_SECRET, LEARNER_KEY_SECRET and ADMIN_PASSKEY used to fall back to a default
 * written in the source when missing. On a deployed function that went unnoticed, and a
 * token signed with the public default (an admin token included) or the public passkey
 * would have been accepted. Guarantees:
 *   1. Local development (USE_LOCAL_DB=true) keeps the defaults.
 *   2. Anywhere else a missing, blank, or public-default value is refused, by name, and
 *      no message contains a value.
 *   3. A token forged with the public default is rejected by a function with a real secret.
 *   4. Admin sign-in is refused (503) when no passkey is configured, even if the attempt is
 *      the public default passkey.
 *   5. The startup check names what is missing and never prints a value.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SignJWT } from 'jose';
import {
  DEV_DEFAULTS, isLocalDevelopment, requireSecret, resolvePasskey, assertProductionSecrets,
} from '../config/secrets';

process.env.USE_LOCAL_DB       = 'true';
process.env.NODE_ENV           = 'production';   // suppress app.listen's dev boot
process.env.SESSION_JWT_SECRET = 'secrets-test-secret-with-32-chars!!';
process.env.CAP_LOCAL_DB_FILE  = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'cap-secrets-test-')), 'db.json');

const REAL = 'a-real-secret-that-is-long-enough-123456';
const env = (vars: Record<string, string | undefined>): NodeJS.ProcessEnv => vars as NodeJS.ProcessEnv;
const local    = (extra: Record<string, string | undefined> = {}) => env({ USE_LOCAL_DB: 'true', ...extra });
const deployed = (extra: Record<string, string | undefined> = {}) => env({ USE_LOCAL_DB: 'false', ...extra });

/** Run `fn` with process.env changed, then put it back. */
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; }
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return await fn(); }
  finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

describe('what counts as local development', () => {
  it('is only USE_LOCAL_DB=true', () => {
    expect(isLocalDevelopment(local())).toBe(true);
    expect(isLocalDevelopment(deployed())).toBe(false);
    expect(isLocalDevelopment(env({}))).toBe(false);                       // unset: treat as deployed
    expect(isLocalDevelopment(env({ USE_LOCAL_DB: 'TRUE' }))).toBe(false); // exact match only
    expect(isLocalDevelopment(env({ USE_LOCAL_DB: '1' }))).toBe(false);
  });
});

describe('requireSecret', () => {
  it('uses the dev default in local development when nothing is set', () => {
    expect(requireSecret('SESSION_JWT_SECRET', local())).toBe(DEV_DEFAULTS.SESSION_JWT_SECRET);
    expect(requireSecret('LEARNER_KEY_SECRET', local({ LEARNER_KEY_SECRET: '   ' }))).toBe(DEV_DEFAULTS.LEARNER_KEY_SECRET);
  });

  it('uses a value that is set, anywhere', () => {
    expect(requireSecret('SESSION_JWT_SECRET', local({ SESSION_JWT_SECRET: REAL }))).toBe(REAL);
    expect(requireSecret('SESSION_JWT_SECRET', deployed({ SESSION_JWT_SECRET: REAL }))).toBe(REAL);
  });

  it('refuses a missing or blank value on a deployed function, naming it', () => {
    for (const vars of [{}, { SESSION_JWT_SECRET: '' }, { SESSION_JWT_SECRET: '   ' }]) {
      expect(() => requireSecret('SESSION_JWT_SECRET', deployed(vars))).toThrowError(/SESSION_JWT_SECRET is not set/);
    }
    expect(() => requireSecret('LEARNER_KEY_SECRET', env({}))).toThrowError(/LEARNER_KEY_SECRET is not set/);
  });

  it('refuses the public default on a deployed function, without printing it', () => {
    for (const name of ['SESSION_JWT_SECRET', 'LEARNER_KEY_SECRET'] as const) {
      let message = '';
      try { requireSecret(name, deployed({ [name]: DEV_DEFAULTS[name] })); } catch (e) { message = (e as Error).message; }
      expect(message).toContain(`${name} is set to the public development default`);
      expect(message).not.toContain(DEV_DEFAULTS[name]);
    }
  });

  it('carries a code the error handler can use', () => {
    try { requireSecret('SESSION_JWT_SECRET', deployed()); } catch (e) {
      expect((e as any).code).toBe('SECRET_NOT_CONFIGURED');
      expect((e as any).statusCode).toBe(500);
    }
  });
});

describe('resolvePasskey', () => {
  it('uses the dev default in local development when nothing is set', () => {
    expect(resolvePasskey(undefined, local())).toBe(DEV_DEFAULTS.ADMIN_PASSKEY);
  });

  it('prefers a stored override, then the environment variable', () => {
    expect(resolvePasskey('stored-pass', deployed({ ADMIN_PASSKEY: 'env-pass' }))).toBe('stored-pass');
    expect(resolvePasskey('', deployed({ ADMIN_PASSKEY: 'env-pass' }))).toBe('env-pass');       // a reset override
    expect(resolvePasskey(null, deployed({ ADMIN_PASSKEY: 'env-pass' }))).toBe('env-pass');
    expect(resolvePasskey(undefined, local({ ADMIN_PASSKEY: 'env-pass' }))).toBe('env-pass');
  });

  it('is null on a deployed function with no passkey, so sign-in is refused', () => {
    expect(resolvePasskey(undefined, deployed())).toBeNull();
    expect(resolvePasskey('', deployed({ ADMIN_PASSKEY: '  ' }))).toBeNull();
    expect(resolvePasskey(undefined, env({}))).toBeNull();
  });

  it('is null on a deployed function whose passkey is the public default', () => {
    expect(resolvePasskey(undefined, deployed({ ADMIN_PASSKEY: DEV_DEFAULTS.ADMIN_PASSKEY }))).toBeNull();
    expect(resolvePasskey(DEV_DEFAULTS.ADMIN_PASSKEY, deployed())).toBeNull();
  });
});

describe('the startup check', () => {
  it('does nothing in local development', () => {
    expect(() => assertProductionSecrets(local())).not.toThrow();
  });

  it('passes on a deployed function with both secrets set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(() => assertProductionSecrets(deployed({ SESSION_JWT_SECRET: REAL, LEARNER_KEY_SECRET: REAL }))).not.toThrow();
      expect(warn).not.toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  it('names every missing secret and never a value', () => {
    let message = '';
    try { assertProductionSecrets(deployed()); } catch (e) { message = (e as Error).message; }
    expect(message).toContain('Refusing to start');
    expect(message).toContain('SESSION_JWT_SECRET');
    expect(message).toContain('LEARNER_KEY_SECRET');

    message = '';
    try { assertProductionSecrets(deployed({ SESSION_JWT_SECRET: DEV_DEFAULTS.SESSION_JWT_SECRET, LEARNER_KEY_SECRET: REAL })); }
    catch (e) { message = (e as Error).message; }
    expect(message).toContain('SESSION_JWT_SECRET');
    expect(message).not.toContain('LEARNER_KEY_SECRET');
    expect(message).not.toContain(DEV_DEFAULTS.SESSION_JWT_SECRET);
  });

  it('warns about a short secret by name but still starts', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(() => assertProductionSecrets(deployed({ SESSION_JWT_SECRET: 'short', LEARNER_KEY_SECRET: REAL }))).not.toThrow();
      expect(JSON.stringify(warn.mock.calls)).toContain('SESSION_JWT_SECRET');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('short"');   // never the value itself
    } finally { warn.mockRestore(); }
  });
});

describe('session tokens', () => {
  it('sign and verify in local development with no secret set', async () => {
    const { issueSessionToken, verifySessionToken } = await import('../services/identity/sessionToken');
    await withEnv({ USE_LOCAL_DB: 'true', SESSION_JWT_SECRET: undefined }, async () => {
      const token = await issueSessionToken({ sessionId: 's', tempUserId: 'u', moduleId: 'm', currentPhase: 1 });
      expect((await verifySessionToken(token)).sessionId).toBe('s');
    });
  });

  it('refuse to sign or verify on a deployed function with no secret', async () => {
    const { issueSessionToken, verifySessionToken } = await import('../services/identity/sessionToken');
    await withEnv({ USE_LOCAL_DB: 'false', SESSION_JWT_SECRET: undefined }, async () => {
      await expect(issueSessionToken({ sessionId: 's', tempUserId: 'u', moduleId: 'm', currentPhase: 1 }))
        .rejects.toMatchObject({ code: 'SECRET_NOT_CONFIGURED' });
      await expect(verifySessionToken('a.b.c')).rejects.toMatchObject({ code: 'SECRET_NOT_CONFIGURED' });
    });
  });

  it('reject an admin token forged with the public default on a function with a real secret', async () => {
    const { verifySessionToken } = await import('../services/identity/sessionToken');
    // What an attacker who has read the source can make: an admin token signed with the default.
    const forged = await new SignJWT({ sessionId: 'admin_x', tempUserId: 'x', moduleId: '', currentPhase: 0, role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h')
      .sign(new TextEncoder().encode(DEV_DEFAULTS.SESSION_JWT_SECRET));
    await withEnv({ USE_LOCAL_DB: 'false', SESSION_JWT_SECRET: REAL }, async () => {
      await expect(verifySessionToken(forged)).rejects.toThrow();
    });
  });

  it('are refused outright if a deployed function is set to the public default', async () => {
    const { verifySessionToken } = await import('../services/identity/sessionToken');
    const forged = await new SignJWT({ sessionId: 'admin_x', tempUserId: 'x', moduleId: '', currentPhase: 0, role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h')
      .sign(new TextEncoder().encode(DEV_DEFAULTS.SESSION_JWT_SECRET));
    await withEnv({ USE_LOCAL_DB: 'false', SESSION_JWT_SECRET: DEV_DEFAULTS.SESSION_JWT_SECRET }, async () => {
      await expect(verifySessionToken(forged)).rejects.toMatchObject({ code: 'SECRET_NOT_CONFIGURED' });
    });
  });
});

describe('learner keys', () => {
  it('are derived in local development with no secret set, and differ with a real secret', async () => {
    const { deriveLearnerKey } = await import('../services/identity/learnerKey');
    const dev  = await withEnv({ USE_LOCAL_DB: 'true', LEARNER_KEY_SECRET: undefined }, async () => deriveLearnerKey('iss', 'sub'));
    const real = await withEnv({ USE_LOCAL_DB: 'false', LEARNER_KEY_SECRET: REAL }, async () => deriveLearnerKey('iss', 'sub'));
    expect(dev).toMatch(/^lk-[0-9a-f]{64}$/);
    expect(real).not.toBe(dev);
  });

  it('are refused on a deployed function with no secret', async () => {
    const { deriveLearnerKey } = await import('../services/identity/learnerKey');
    await withEnv({ USE_LOCAL_DB: 'false', LEARNER_KEY_SECRET: undefined }, async () => {
      expect(() => deriveLearnerKey('iss', 'sub')).toThrowError(/LEARNER_KEY_SECRET is not set/);
    });
  });
});

describe('admin sign-in', () => {
  let handleAdminLogin: typeof import('../services/admin/authService')['handleAdminLogin'];
  let platformConfigDb: typeof import('../db/platformConfigDb')['platformConfigDb'];
  beforeAll(async () => {
    ({ handleAdminLogin }  = await import('../services/admin/authService'));
    ({ platformConfigDb }  = await import('../db/platformConfigDb'));
  });

  const login = async (passkey: string, expected: string | null) => {
    const spy = vi.spyOn(platformConfigDb, 'passkey').mockResolvedValue(expected);
    let status = 200; let body: any;
    const res: any = { status(c: number) { status = c; return res; }, json(b: any) { body = b; return res; } };
    try { await handleAdminLogin({ body: { passkey } } as any, res); }
    finally { spy.mockRestore(); }
    return { status, body };
  };

  it('is refused with a 503 when no passkey is configured, even for the public default passkey', async () => {
    const r = await login(DEV_DEFAULTS.ADMIN_PASSKEY, null);
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('ADMIN_NOT_CONFIGURED');
    expect(r.body.token).toBeUndefined();
  });

  it('rejects a wrong passkey and accepts the right one', async () => {
    expect((await login('wrong', 'right-passkey')).status).toBe(401);
    const ok = await login('right-passkey', 'right-passkey');
    expect(ok.status).toBe(200);
    expect(ok.body.role).toBe('admin');
  });
});
