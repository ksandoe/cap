/**
 * secretsManager.test.ts — Loading the sensitive settings from Secrets Manager.
 *
 * Guarantees:
 *   1. Off unless APP_SECRETS_ID is set: nothing is read, nothing changes.
 *   2. Only the allowed names are copied into the environment; anything else in the secret
 *      is ignored and named, so a secret can never switch on USE_LOCAL_DB or repoint a table.
 *   3. A variable already set on the function wins, and is reported by name.
 *   4. A secret that cannot be read, or is malformed, makes loading fail. It never falls
 *      back to a default.
 *   5. No value, and no part of one, appears in a log line or an error message.
 *   6. The app is built only after the secrets are loaded; concurrent first requests share
 *      one start-up; a failed start-up is retried by the next request.
 *
 * Uses a fake client. Nothing here reaches AWS.
 */
import { describe, it, expect, vi } from 'vitest';
import { loadSecretsIntoEnv, SECRET_KEYS, type SecretsClientLike } from '../config/secretsManager';
import { assertProductionSecrets } from '../config/secrets';
import { makeHandler } from '../lambda/bootstrap';

const VALUE_A = 'value-a-should-never-be-logged-111';
const VALUE_B = 'value-b-should-never-be-logged-222';

const env = (vars: Record<string, string | undefined>): NodeJS.ProcessEnv => ({ ...vars }) as NodeJS.ProcessEnv;
const clientReturning = (secret: unknown): SecretsClientLike & { send: ReturnType<typeof vi.fn> } => ({
  send: vi.fn().mockResolvedValue({ SecretString: typeof secret === 'string' ? secret : JSON.stringify(secret) }),
});

/** Capture everything logged while `fn` runs. */
async function logged<T>(fn: () => Promise<T>): Promise<{ result?: T; error?: Error; output: string }> {
  const log  = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const err  = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const result = await fn();
    return { result, output: JSON.stringify([...log.mock.calls, ...warn.mock.calls, ...err.mock.calls]) };
  } catch (e) {
    return { error: e as Error, output: JSON.stringify([...log.mock.calls, ...warn.mock.calls, ...err.mock.calls]) };
  } finally { log.mockRestore(); warn.mockRestore(); err.mockRestore(); }
}

describe('when it is switched off', () => {
  it('reads nothing and changes nothing without APP_SECRETS_ID', async () => {
    const client = clientReturning({ SESSION_JWT_SECRET: VALUE_A });
    const e = env({ USE_LOCAL_DB: 'false' });
    const { result } = await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(result).toEqual({ source: 'none', fromSecret: [], keptFromEnv: [], ignored: [] });
    expect(client.send).not.toHaveBeenCalled();
    expect(e.SESSION_JWT_SECRET).toBeUndefined();
  });

  it('treats a blank APP_SECRETS_ID as off', async () => {
    const client = clientReturning({});
    await logged(() => loadSecretsIntoEnv({ env: env({ APP_SECRETS_ID: '   ' }), client }));
    expect(client.send).not.toHaveBeenCalled();
  });
});

describe('loading the secret', () => {
  it('asks for the named secret', async () => {
    const client = clientReturning({ SESSION_JWT_SECRET: VALUE_A });
    await logged(() => loadSecretsIntoEnv({ env: env({ APP_SECRETS_ID: 'cap/prod/app' }), client }));
    expect(client.send).toHaveBeenCalledTimes(1);
    expect((client.send.mock.calls[0][0] as any).input.SecretId).toBe('cap/prod/app');
  });

  it('copies the allowed names into the environment', async () => {
    const client = clientReturning({ SESSION_JWT_SECRET: VALUE_A, ADMIN_PASSKEY: VALUE_B });
    const e = env({ APP_SECRETS_ID: 'cap/prod/app' });
    const { result } = await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(e.SESSION_JWT_SECRET).toBe(VALUE_A);
    expect(e.ADMIN_PASSKEY).toBe(VALUE_B);
    expect(result!.source).toBe('secrets-manager');
    expect(result!.fromSecret.sort()).toEqual(['ADMIN_PASSKEY', 'SESSION_JWT_SECRET']);
  });

  it('accepts a multi-line value such as a private key', async () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nabc\ndef\n-----END PRIVATE KEY-----\n';
    const e = env({ APP_SECRETS_ID: 'cap/prod/app' });
    await logged(() => loadSecretsIntoEnv({ env: e, client: clientReturning({ LTI_PRIVATE_KEY: pem }) }));
    expect(e.LTI_PRIVATE_KEY).toBe(pem);
  });

  it('only allows the sensitive names, and none of the switches', () => {
    expect([...SECRET_KEYS].sort()).toEqual([
      'ADMIN_PASSKEY', 'DATABASE_URL', 'LEARNER_KEY_SECRET', 'LTI_PRIVATE_KEY',
      'OPENAI_API_KEY', 'SAP_CLIENT_SECRET', 'SESSION_JWT_SECRET',
    ]);
    for (const dangerous of ['USE_LOCAL_DB', 'NODE_ENV', 'ENABLE_DEV_ROUTES', 'LLM_MODE', 'APP_SECRETS_ID', 'DYNAMODB_TABLE_SESSIONS']) {
      expect(SECRET_KEYS as readonly string[]).not.toContain(dangerous);
    }
  });

  it('ignores any other name in the secret, reports it, and leaves the environment alone', async () => {
    const client = clientReturning({
      SESSION_JWT_SECRET: VALUE_A, USE_LOCAL_DB: 'true', NODE_ENV: 'development', DYNAMODB_TABLE_SESSIONS: VALUE_B,
    });
    const e = env({ APP_SECRETS_ID: 'cap/prod/app', USE_LOCAL_DB: 'false' });
    const { result, output } = await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(e.USE_LOCAL_DB).toBe('false');          // a secret cannot switch on local mode
    expect(e.NODE_ENV).toBeUndefined();
    expect(e.DYNAMODB_TABLE_SESSIONS).toBeUndefined();
    expect(result!.ignored.sort()).toEqual(['DYNAMODB_TABLE_SESSIONS', 'NODE_ENV', 'USE_LOCAL_DB']);
    expect(output).toContain('USE_LOCAL_DB');       // named...
    expect(output).not.toContain(VALUE_B);          // ...but never its value
  });

  it('lets a variable already set on the function win, and says so by name', async () => {
    const client = clientReturning({ SESSION_JWT_SECRET: VALUE_A, ADMIN_PASSKEY: VALUE_B });
    const e = env({ APP_SECRETS_ID: 'cap/prod/app', SESSION_JWT_SECRET: 'from-the-function-environment' });
    const { result, output } = await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(e.SESSION_JWT_SECRET).toBe('from-the-function-environment');
    expect(e.ADMIN_PASSKEY).toBe(VALUE_B);
    expect(result!.keptFromEnv).toEqual(['SESSION_JWT_SECRET']);
    expect(result!.fromSecret).toEqual(['ADMIN_PASSKEY']);
    expect(output).toContain('SESSION_JWT_SECRET');
    expect(output).not.toContain('from-the-function-environment');
  });

  it('logs names only, never a value', async () => {
    const client = clientReturning({ SESSION_JWT_SECRET: VALUE_A, ADMIN_PASSKEY: VALUE_B, OTHER: VALUE_B });
    const { output } = await logged(() => loadSecretsIntoEnv({ env: env({ APP_SECRETS_ID: 'cap/prod/app' }), client }));
    expect(output).toContain('SESSION_JWT_SECRET');
    expect(output).not.toContain(VALUE_A);
    expect(output).not.toContain(VALUE_B);
  });
});

describe('when the secret cannot be used', () => {
  const e = () => env({ APP_SECRETS_ID: 'cap/prod/app' });

  it('fails, naming the problem but not the error text, when it cannot be read', async () => {
    const client: SecretsClientLike = {
      send: vi.fn().mockRejectedValue(Object.assign(new Error('LEAK-ME arn and request details'), { name: 'AccessDeniedException' })),
    };
    const { error } = await logged(() => loadSecretsIntoEnv({ env: e(), client }));
    expect(error?.message).toContain('could not read the secret "cap/prod/app"');
    expect(error?.message).toContain('AccessDeniedException');
    expect(error?.message).not.toContain('LEAK-ME');
    expect((error as any).code).toBe('SECRETS_LOAD_FAILED');
  });

  it('fails when the secret is not text', async () => {
    const client: SecretsClientLike = { send: vi.fn().mockResolvedValue({ SecretBinary: new Uint8Array([1, 2]) }) };
    const { error } = await logged(() => loadSecretsIntoEnv({ env: e(), client }));
    expect(error?.message).toContain('not a text secret');
  });

  it('fails when it is not valid JSON, without quoting it', async () => {
    const { error } = await logged(() => loadSecretsIntoEnv({ env: e(), client: clientReturning(`oops ${VALUE_A}`) }));
    expect(error?.message).toContain('not valid JSON');
    expect(error?.message).not.toContain(VALUE_A);
  });

  it('fails when it is not an object of pairs', async () => {
    for (const bad of ['[1,2]', 'null', '"just a string"', '42']) {
      const { error } = await logged(() => loadSecretsIntoEnv({ env: e(), client: clientReturning(bad) }));
      expect(error?.message, bad).toContain('must be a JSON object');
    }
  });

  it('fails on a blank or non-text value for an allowed name, naming it only', async () => {
    for (const value of ['', '   ', 123, null, { nested: VALUE_A }]) {
      const { error } = await logged(() => loadSecretsIntoEnv({ env: e(), client: clientReturning({ ADMIN_PASSKEY: value }) }));
      expect(error?.message, JSON.stringify(value)).toContain('ADMIN_PASSKEY');
      expect(error?.message).not.toContain(VALUE_A);
    }
  });
});

describe('together with the start-up check', () => {
  it('lets a deployed function start when the secret supplies the token secrets', async () => {
    const real = 'a-real-secret-that-is-long-enough-123456';
    const client = clientReturning({ SESSION_JWT_SECRET: real, LEARNER_KEY_SECRET: `${real}-learner` });
    const e = env({ USE_LOCAL_DB: 'false', APP_SECRETS_ID: 'cap/prod/app' });
    expect(() => assertProductionSecrets(e)).toThrowError(/Refusing to start/);     // before the load
    await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(() => assertProductionSecrets(e)).not.toThrow();                          // after the load
  });

  it('still refuses a secret that holds the public default', async () => {
    const client = clientReturning({ SESSION_JWT_SECRET: 'dev-secret-change-me', LEARNER_KEY_SECRET: 'x'.repeat(40) });
    const e = env({ USE_LOCAL_DB: 'false', APP_SECRETS_ID: 'cap/prod/app' });
    await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(() => assertProductionSecrets(e)).toThrowError(/SESSION_JWT_SECRET is set to the public development default/);
  });
});

describe('the start-up order of the Lambda handler', () => {
  const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };

  it('builds the app only after the secrets are loaded', async () => {
    const order: string[] = [];
    const gate = deferred();
    const handler = makeHandler<string, void, string>({
      loadSecrets: async () => { order.push('load-start'); await gate.promise; order.push('load-end'); },
      build: async () => { order.push('build'); return async (event) => `handled ${event}`; },
    });
    const pending = handler('GET /', undefined);
    await Promise.resolve();
    expect(order).toEqual(['load-start']);                // build has not started while loading
    gate.resolve();
    expect(await pending).toBe('handled GET /');
    expect(order).toEqual(['load-start', 'load-end', 'build']);
  });

  it('starts once for concurrent first requests and reuses the app afterwards', async () => {
    const loadSecrets = vi.fn().mockResolvedValue(undefined);
    const build = vi.fn().mockResolvedValue(async (event: string) => `ok ${event}`);
    const handler = makeHandler<string, void, string>({ loadSecrets, build });
    const results = await Promise.all([handler('a', undefined), handler('b', undefined), handler('c', undefined)]);
    expect(results).toEqual(['ok a', 'ok b', 'ok c']);
    await handler('d', undefined);
    expect(loadSecrets).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('does not build the app when loading fails, and the next request tries again', async () => {
    const loadSecrets = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('could not read the secret'), { code: 'SECRETS_LOAD_FAILED' }))
      .mockResolvedValue(undefined);
    const build = vi.fn().mockResolvedValue(async (event: string) => `ok ${event}`);
    const handler = makeHandler<string, void, string>({ loadSecrets, build });
    await expect(handler('first', undefined)).rejects.toMatchObject({ code: 'SECRETS_LOAD_FAILED' });
    expect(build).not.toHaveBeenCalled();                 // never built without the secrets
    expect(await handler('second', undefined)).toBe('ok second');   // fixed permission: no redeploy needed
    expect(loadSecrets).toHaveBeenCalledTimes(2);
  });

  it('keeps reporting the original error when the app itself fails to start, and does not import it again', async () => {
    // The bundler does not re-run a module that threw while loading, so a second attempt would
    // hand back a half-built app and hide the real cause behind a confusing error.
    const build = vi.fn().mockRejectedValue(new Error('Refusing to start: SESSION_JWT_SECRET is not set.'));
    const loadSecrets = vi.fn().mockResolvedValue(undefined);
    const handler = makeHandler<string, void, string>({ loadSecrets, build });
    await expect(handler('first', undefined)).rejects.toThrow('Refusing to start');
    await expect(handler('second', undefined)).rejects.toThrow('Refusing to start');
    expect(build).toHaveBeenCalledTimes(1);
    expect(loadSecrets).toHaveBeenCalledTimes(1);
  });
});
