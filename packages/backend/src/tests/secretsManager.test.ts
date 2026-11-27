/**
 * secretsManager.test.ts — Loading the sensitive settings from Secrets Manager.
 *
 * Guarantees:
 *   1. Off unless APP_SECRETS_ID is set: nothing is read, nothing changes.
 *   2. Only the allowed names are copied into the environment; anything else in a secret is
 *      ignored and named, so a secret can never switch on USE_LOCAL_DB or repoint a table.
 *   3. A variable already set on the function wins, and is reported by name.
 *   4. A BROKEN OR UNREADABLE SECRET DOES NOT STOP THE APP, as long as the app can still start
 *      safely: it is skipped and logged as an ERROR naming it. This is the incident where a
 *      Canvas key stored as a nested object (the wrong PowerShell snippet) made the function
 *      return 500 on every request even though nothing used that key yet.
 *   5. The exception is the two names a deployed function cannot start without (the session
 *      secret and the learner-key secret, which have public defaults in the source): if either
 *      is still missing after loading, loading throws, and the next request tries again.
 *   6. A name in two secrets is applied from neither.
 *   7. No value, and no part of one, appears in a log line or an error message, and the AWS
 *      error text is never echoed.
 *   8. The app is built only after the secrets are loaded; concurrent first requests share one
 *      start-up; a failed secret load is retried by the next request.
 *
 * Uses a fake client. Nothing here reaches AWS.
 */
import { describe, it, expect, vi } from 'vitest';
import { loadSecretsIntoEnv, parseSecretIds, SECRET_KEYS, REQUIRED_SECRET_KEYS, type SecretsClientLike } from '../config/secretsManager';
import { assertProductionSecrets } from '../config/secrets';
import { makeHandler } from '../lambda/bootstrap';

const VALUE_A = 'value-a-should-never-be-logged-111';
const VALUE_B = 'value-b-should-never-be-logged-222';
const REAL    = 'a-real-secret-that-is-long-enough-123456';
const PEM     = '-----BEGIN PRIVATE KEY-----\nabc\ndef\n-----END PRIVATE KEY-----\n';

const env = (vars: Record<string, string | undefined>): NodeJS.ProcessEnv => ({ ...vars }) as NodeJS.ProcessEnv;
/** Local development: the required secrets may be missing (their development defaults apply). */
const local = (extra: Record<string, string | undefined> = {}) => env({ USE_LOCAL_DB: 'true', APP_SECRETS_ID: 'cap/prod/app', ...extra });
/** A deployed function whose required secrets are already set as environment variables. */
const deployedWithRequired = (extra: Record<string, string | undefined> = {}) =>
  env({ USE_LOCAL_DB: 'false', APP_SECRETS_ID: 'cap/prod/app', SESSION_JWT_SECRET: REAL, LEARNER_KEY_SECRET: `${REAL}-l`, ...extra });
/** A deployed function with nothing set: it relies on the secrets for the required ones. */
const deployedBare = (extra: Record<string, string | undefined> = {}) =>
  env({ USE_LOCAL_DB: 'false', APP_SECRETS_ID: 'cap/prod/app', ...extra });

const clientReturning = (secret: unknown): SecretsClientLike & { send: ReturnType<typeof vi.fn> } => ({
  send: vi.fn().mockResolvedValue({ SecretString: typeof secret === 'string' ? secret : JSON.stringify(secret) }),
});

/** A fake that serves a different secret per name. Names in `broken` fail with the given error name; a name
 *  that is not served is reported as not found. The error text deliberately contains a marker that must never
 *  be echoed. */
function clientByName(secrets: Record<string, unknown>, broken: Record<string, string> = {}) {
  return {
    send: vi.fn(async (command: any) => {
      const id = command.input.SecretId as string;
      if (id in broken) throw Object.assign(new Error('REQUEST-DETAILS'), { name: broken[id] });
      if (!(id in secrets)) throw Object.assign(new Error('REQUEST-DETAILS'), { name: 'ResourceNotFoundException' });
      const value = secrets[id];
      return { SecretString: typeof value === 'string' ? value : JSON.stringify(value) };
    }),
  };
}

/** Capture everything logged while `fn` runs. */
async function logged<T>(fn: () => Promise<T>): Promise<{ result?: T; error?: Error; output: string }> {
  const log  = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const err  = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const out  = () => JSON.stringify([...log.mock.calls, ...warn.mock.calls, ...err.mock.calls]);
  try {
    const result = await fn();
    return { result, output: out() };
  } catch (e) {
    return { error: e as Error, output: out() };
  } finally { log.mockRestore(); warn.mockRestore(); err.mockRestore(); }
}

describe('when it is switched off', () => {
  it('reads nothing and changes nothing without APP_SECRETS_ID', async () => {
    const client = clientReturning({ SESSION_JWT_SECRET: VALUE_A });
    const e = env({ USE_LOCAL_DB: 'false' });
    const { result } = await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(result).toEqual({ source: 'none', secretIds: [], fromSecret: [], keptFromEnv: [], ignored: [], problems: [] });
    expect(client.send).not.toHaveBeenCalled();
    expect(e.SESSION_JWT_SECRET).toBeUndefined();
  });

  it('treats a blank APP_SECRETS_ID as off', async () => {
    const client = clientReturning({});
    const { result } = await logged(() => loadSecretsIntoEnv({ env: env({ APP_SECRETS_ID: '   ' }), client }));
    expect(client.send).not.toHaveBeenCalled();
    expect(result!.source).toBe('none');
  });
});

describe('loading a secret', () => {
  it('asks for the named secret', async () => {
    const client = clientReturning({ SESSION_JWT_SECRET: VALUE_A });
    await logged(() => loadSecretsIntoEnv({ env: local(), client }));
    expect(client.send).toHaveBeenCalledTimes(1);
    expect((client.send.mock.calls[0][0] as any).input.SecretId).toBe('cap/prod/app');
  });

  it('copies the allowed names into the environment', async () => {
    const client = clientReturning({ SESSION_JWT_SECRET: VALUE_A, ADMIN_PASSKEY: VALUE_B });
    const e = local();
    const { result } = await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(e.SESSION_JWT_SECRET).toBe(VALUE_A);
    expect(e.ADMIN_PASSKEY).toBe(VALUE_B);
    expect(result!.source).toBe('secrets-manager');
    expect(result!.fromSecret.sort()).toEqual(['ADMIN_PASSKEY', 'SESSION_JWT_SECRET']);
    expect(result!.problems).toEqual([]);
  });

  it('accepts a multi-line value such as a private key', async () => {
    const e = local();
    await logged(() => loadSecretsIntoEnv({ env: e, client: clientReturning({ LTI_PRIVATE_KEY: PEM }) }));
    expect(e.LTI_PRIVATE_KEY).toBe(PEM);
  });

  it('only allows the sensitive names, and none of the switches', () => {
    expect([...SECRET_KEYS].sort()).toEqual([
      'ADMIN_PASSKEY', 'DATABASE_URL', 'LEARNER_KEY_SECRET', 'LTI_PRIVATE_KEY',
      'OPENAI_API_KEY', 'SAP_CLIENT_SECRET', 'SESSION_JWT_SECRET',
    ]);
    for (const dangerous of ['USE_LOCAL_DB', 'NODE_ENV', 'ENABLE_DEV_ROUTES', 'LLM_MODE', 'APP_SECRETS_ID', 'DYNAMODB_TABLE_SESSIONS']) {
      expect(SECRET_KEYS as readonly string[]).not.toContain(dangerous);
    }
    expect([...REQUIRED_SECRET_KEYS]).toEqual(['SESSION_JWT_SECRET', 'LEARNER_KEY_SECRET']);
  });

  it('ignores any other name in the secret, reports it, and leaves the environment alone', async () => {
    const client = clientReturning({
      SESSION_JWT_SECRET: VALUE_A, USE_LOCAL_DB: 'true', NODE_ENV: 'development', DYNAMODB_TABLE_SESSIONS: VALUE_B,
    });
    const e = deployedWithRequired({ SESSION_JWT_SECRET: undefined, LEARNER_KEY_SECRET: REAL });
    // The secret supplies SESSION_JWT_SECRET; USE_LOCAL_DB in the secret must not flip the function to local mode.
    const { result, output } = await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(e.USE_LOCAL_DB).toBe('false');
    expect(e.NODE_ENV).toBeUndefined();
    expect(e.DYNAMODB_TABLE_SESSIONS).toBeUndefined();
    expect(result!.ignored.sort()).toEqual(['DYNAMODB_TABLE_SESSIONS', 'NODE_ENV', 'USE_LOCAL_DB']);
    expect(output).toContain('USE_LOCAL_DB');       // named...
    expect(output).not.toContain(VALUE_B);          // ...but never its value
  });

  it('lets a variable already set on the function win, and says so by name', async () => {
    const client = clientReturning({ SESSION_JWT_SECRET: VALUE_A, ADMIN_PASSKEY: VALUE_B });
    const e = local({ SESSION_JWT_SECRET: 'from-the-function-environment' });
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
    const { output } = await logged(() => loadSecretsIntoEnv({ env: local(), client }));
    expect(output).toContain('SESSION_JWT_SECRET');
    expect(output).not.toContain(VALUE_A);
    expect(output).not.toContain(VALUE_B);
  });
});

describe('a broken secret does not stop the app', () => {
  // These run on a deployed function whose required secrets are already set, so the only thing
  // under test is what happens to the broken secret.
  const deployed = () => deployedWithRequired();

  it('skips an unreadable secret, logs an ERROR naming it, and carries on', async () => {
    const client: SecretsClientLike = {
      send: vi.fn().mockRejectedValue(Object.assign(new Error('LEAK-ME arn and request details'), { name: 'AccessDeniedException' })),
    };
    const { result, error, output } = await logged(() => loadSecretsIntoEnv({ env: deployed(), client }));
    expect(error).toBeUndefined();                              // the app is not stopped
    expect(result!.fromSecret).toEqual([]);
    expect(result!.problems).toHaveLength(1);
    expect(result!.problems[0]).toContain('Could not read the secret "cap/prod/app" (AccessDeniedException)');
    expect(output).toContain('[secrets] ERROR');
    expect(output).not.toContain('LEAK-ME');                    // the AWS text is never echoed
  });

  it('skips a secret that is not text, not JSON, or not an object, without quoting it', async () => {
    const cases: [unknown, string][] = [
      [{ SecretBinary: new Uint8Array([1, 2]) }, 'is not a text secret'],
      [`oops ${VALUE_A}`, 'is not valid JSON'],
      ['[1,2]', 'must be a JSON object'],
      ['null', 'must be a JSON object'],
      ['"just a string"', 'must be a JSON object'],
    ];
    for (const [body, why] of cases) {
      const client: SecretsClientLike = {
        send: vi.fn().mockResolvedValue(typeof body === 'string' ? { SecretString: body } : body),
      };
      const { result, error, output } = await logged(() => loadSecretsIntoEnv({ env: deployed(), client }));
      expect(error, why).toBeUndefined();
      expect(result!.problems.join(' '), why).toContain(why);
      expect(output).not.toContain(VALUE_A);
    }
  });

  it('survives the exact incident: a Canvas key stored as a nested object', async () => {
    // What the old PowerShell snippet produced on Windows PowerShell 5.1.
    const nested = { LTI_PRIVATE_KEY: { value: PEM, PSPath: 'C:\\somewhere\\key.pem', Length: 1708 } };
    const e = deployed();
    const { result, error, output } = await logged(() =>
      loadSecretsIntoEnv({ env: e, client: clientByName({ 'cap/prod/app': nested }) }));
    expect(error).toBeUndefined();                              // the site stays up
    expect(e.LTI_PRIVATE_KEY).toBeUndefined();                  // nothing half-applied
    expect(result!.problems.join(' ')).toContain('LTI_PRIVATE_KEY in the secret "cap/prod/app" is not a non-empty text value');
    expect(output).toContain('[secrets] ERROR');
    expect(output).not.toContain('abc');                        // none of the key text
    expect(output).not.toContain('somewhere');
  });

  it('skips only the one bad value and still applies the rest of that secret', async () => {
    for (const bad of ['', '   ', 123, null, { nested: VALUE_A }, [VALUE_A]]) {
      const e = deployed();
      const client = clientReturning({ ADMIN_PASSKEY: VALUE_B, OPENAI_API_KEY: bad });
      const { result, error, output } = await logged(() => loadSecretsIntoEnv({ env: e, client }));
      expect(error, JSON.stringify(bad)).toBeUndefined();
      expect(e.ADMIN_PASSKEY).toBe(VALUE_B);                    // the good one still applied
      expect(e.OPENAI_API_KEY).toBeUndefined();                 // the bad one skipped
      expect(result!.problems.join(' ')).toContain('OPENAI_API_KEY in the secret "cap/prod/app"');
      expect(output).not.toContain(VALUE_A);
    }
  });

  it('applies a name found in two secrets from neither, and names both', async () => {
    const client = clientByName({
      'cap/prod/app': { ADMIN_PASSKEY: VALUE_B, OPENAI_API_KEY: 'only-in-the-first-secret-value' },
      'cap/lti-dev':  { ADMIN_PASSKEY: 'a-second-value-that-must-not-leak', LTI_PRIVATE_KEY: PEM },
    });
    const e = deployed(); e.APP_SECRETS_ID = 'cap/prod/app,cap/lti-dev';
    const { result, error, output } = await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(error).toBeUndefined();
    expect(e.ADMIN_PASSKEY).toBeUndefined();                    // ambiguous: applied from neither
    expect(e.OPENAI_API_KEY).toBe('only-in-the-first-secret-value');   // the rest still applies
    expect(e.LTI_PRIVATE_KEY).toBe(PEM);
    expect(result!.problems.join(' ')).toContain('ADMIN_PASSKEY is in both "cap/prod/app" and "cap/lti-dev"');
    expect(output).not.toContain(VALUE_B);
    expect(output).not.toContain('a-second-value-that-must-not-leak');
  });

  it('still applies a readable secret when another one cannot be read', async () => {
    const client = clientByName({ 'cap/prod/app': { OPENAI_API_KEY: VALUE_A } }, { 'cap/lti-dev': 'AccessDeniedException' });
    const e = deployed(); e.APP_SECRETS_ID = 'cap/prod/app,cap/lti-dev';
    const { result, error } = await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(error).toBeUndefined();
    expect(e.OPENAI_API_KEY).toBe(VALUE_A);
    expect(result!.problems.join(' ')).toContain('Could not read the secret "cap/lti-dev" (AccessDeniedException)');
  });

  it('does not stop a local developer either', async () => {
    const client: SecretsClientLike = { send: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'ExpiredTokenException' })) };
    const { error, result } = await logged(() => loadSecretsIntoEnv({ env: local(), client }));
    expect(error).toBeUndefined();                              // the development defaults apply
    expect(result!.problems.join(' ')).toContain('ExpiredTokenException');
  });
});

describe('the required secrets on a deployed function', () => {
  it('throws, naming them, when they are missing everywhere because the secret is unreadable', async () => {
    const client: SecretsClientLike = {
      send: vi.fn().mockRejectedValue(Object.assign(new Error('LEAK-ME'), { name: 'AccessDeniedException' })),
    };
    const { error, output } = await logged(() => loadSecretsIntoEnv({ env: deployedBare(), client }));
    expect(error?.message).toContain('SESSION_JWT_SECRET and LEARNER_KEY_SECRET are required');
    expect(error?.message).toContain('Could not read the secret "cap/prod/app" (AccessDeniedException)');
    expect(error?.message).not.toContain('LEAK-ME');
    expect((error as any).code).toBe('SECRETS_LOAD_FAILED');
    expect((error as any).statusCode).toBe(500);
    expect(output).toContain('[secrets] ERROR');
  });

  it('throws when the secret loads fine but does not hold them', async () => {
    const { error } = await logged(() => loadSecretsIntoEnv({ env: deployedBare(), client: clientReturning({ ADMIN_PASSKEY: VALUE_A }) }));
    expect(error?.message).toContain('SESSION_JWT_SECRET and LEARNER_KEY_SECRET are required');
    expect(error?.message).not.toContain('Problems:');
  });

  it('names only the one that is missing', async () => {
    const e = deployedBare({ SESSION_JWT_SECRET: REAL });
    const { error } = await logged(() => loadSecretsIntoEnv({ env: e, client: clientReturning({ ADMIN_PASSKEY: VALUE_A }) }));
    expect(error?.message).toContain('LEARNER_KEY_SECRET is required');
    expect(error?.message).not.toContain('SESSION_JWT_SECRET');
  });

  it('is satisfied by the secret, by the environment, or a mix', async () => {
    const fromSecret = deployedBare();
    await logged(() => loadSecretsIntoEnv({ env: fromSecret, client: clientReturning({ SESSION_JWT_SECRET: REAL, LEARNER_KEY_SECRET: `${REAL}-l` }) }));
    expect(fromSecret.SESSION_JWT_SECRET).toBe(REAL);

    const mixed = deployedBare({ LEARNER_KEY_SECRET: `${REAL}-env` });
    const { error } = await logged(() => loadSecretsIntoEnv({ env: mixed, client: clientReturning({ SESSION_JWT_SECRET: REAL }) }));
    expect(error).toBeUndefined();
  });

  it('treats a required name found in two secrets as missing, since it is applied from neither', async () => {
    const client = clientByName({
      'cap/prod/app': { SESSION_JWT_SECRET: VALUE_A, LEARNER_KEY_SECRET: `${REAL}-l` },
      'cap/lti-dev':  { SESSION_JWT_SECRET: VALUE_B },
    });
    const e = deployedBare({ APP_SECRETS_ID: 'cap/prod/app,cap/lti-dev' });
    const { error } = await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(error?.message).toContain('SESSION_JWT_SECRET is required');
    expect(error?.message).toContain('is in both "cap/prod/app" and "cap/lti-dev"');
    expect(error?.message).not.toContain(VALUE_A);
    expect(error?.message).not.toContain(VALUE_B);
  });

  it('is not enforced in local development, where the development defaults apply', async () => {
    const { error } = await logged(() => loadSecretsIntoEnv({ env: local(), client: clientReturning({ ADMIN_PASSKEY: VALUE_A }) }));
    expect(error).toBeUndefined();
  });
});

describe('several secrets, split by who may read them', () => {
  it('reads a comma-separated list, trimming blanks and repeats', () => {
    expect(parseSecretIds(undefined)).toEqual([]);
    expect(parseSecretIds('   ')).toEqual([]);
    expect(parseSecretIds('cap/prod/app')).toEqual(['cap/prod/app']);
    expect(parseSecretIds(' cap/prod/app , cap/lti-dev ,, cap/prod/app ')).toEqual(['cap/prod/app', 'cap/lti-dev']);
  });

  it('loads both secrets, in order, and applies the values from each', async () => {
    const client = clientByName({
      'cap/prod/app': { SESSION_JWT_SECRET: VALUE_A, ADMIN_PASSKEY: VALUE_B },
      'cap/lti-dev':  { LTI_PRIVATE_KEY: PEM },
    });
    const e = local({ APP_SECRETS_ID: 'cap/prod/app,cap/lti-dev' });
    const { result, output } = await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(client.send.mock.calls.map(c => (c[0] as any).input.SecretId)).toEqual(['cap/prod/app', 'cap/lti-dev']);
    expect(e.SESSION_JWT_SECRET).toBe(VALUE_A);
    expect(e.ADMIN_PASSKEY).toBe(VALUE_B);
    expect(e.LTI_PRIVATE_KEY).toBe(PEM);
    expect(result!.secretIds).toEqual(['cap/prod/app', 'cap/lti-dev']);
    expect(result!.fromSecret.sort()).toEqual(['ADMIN_PASSKEY', 'LTI_PRIVATE_KEY', 'SESSION_JWT_SECRET']);
    expect(output).toContain('cap/lti-dev');          // each secret is named in the log...
    expect(output).not.toContain(VALUE_A);            // ...never a value
    expect(output).not.toContain('abc');
  });

  it('lets a developer load only the Canvas key secret and nothing else', async () => {
    // Aliyah's case: her sign-in can read only the small secret, so that is all she names.
    const client = clientByName({ 'cap/lti-dev': { LTI_PRIVATE_KEY: PEM } });
    const e = local({ APP_SECRETS_ID: 'cap/lti-dev' });
    await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(e.LTI_PRIVATE_KEY).toBe(PEM);
    expect(e.SESSION_JWT_SECRET).toBeUndefined();
    expect(e.ADMIN_PASSKEY).toBeUndefined();
    expect(client.send).toHaveBeenCalledTimes(1);     // the main secret is never even requested
  });

  it('applies the allowed-names and environment-wins rules to each secret', async () => {
    const client = clientByName({
      'cap/prod/app': { SESSION_JWT_SECRET: VALUE_A, USE_LOCAL_DB: 'true' },
      'cap/lti-dev':  { LTI_PRIVATE_KEY: PEM, NODE_ENV: 'development' },
    });
    // USE_LOCAL_DB is false here (a deployed function), so the learner-key secret must come from somewhere.
    const e = local({ APP_SECRETS_ID: 'cap/prod/app,cap/lti-dev', LTI_PRIVATE_KEY: 'set-on-the-function', USE_LOCAL_DB: 'false', LEARNER_KEY_SECRET: REAL });
    const { result, output } = await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(e.SESSION_JWT_SECRET).toBe(VALUE_A);
    expect(e.LTI_PRIVATE_KEY).toBe('set-on-the-function');    // the environment wins
    expect(e.USE_LOCAL_DB).toBe('false');                      // not an allowed name: ignored
    expect(e.NODE_ENV).toBeUndefined();
    expect(result!.keptFromEnv).toEqual(['LTI_PRIVATE_KEY']);
    expect(result!.ignored.sort()).toEqual(['NODE_ENV', 'USE_LOCAL_DB']);
    expect(output).not.toContain('set-on-the-function');
  });
});

describe('together with the start-up check', () => {
  it('lets a deployed function start when the secret supplies the token secrets', async () => {
    const client = clientReturning({ SESSION_JWT_SECRET: REAL, LEARNER_KEY_SECRET: `${REAL}-learner` });
    const e = deployedBare();
    expect(() => assertProductionSecrets(e)).toThrowError(/Refusing to start/);     // before the load
    await logged(() => loadSecretsIntoEnv({ env: e, client }));
    expect(() => assertProductionSecrets(e)).not.toThrow();                          // after the load
  });

  it('still refuses a secret that holds the public default', async () => {
    const client = clientReturning({ SESSION_JWT_SECRET: 'dev-secret-change-me', LEARNER_KEY_SECRET: 'x'.repeat(40) });
    const e = deployedBare();
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
      .mockRejectedValueOnce(Object.assign(new Error('required secrets are missing'), { code: 'SECRETS_LOAD_FAILED' }))
      .mockResolvedValue(undefined);
    const build = vi.fn().mockResolvedValue(async (event: string) => `ok ${event}`);
    const handler = makeHandler<string, void, string>({ loadSecrets, build });
    await expect(handler('first', undefined)).rejects.toMatchObject({ code: 'SECRETS_LOAD_FAILED' });
    expect(build).not.toHaveBeenCalled();                 // never built without the required secrets
    expect(await handler('second', undefined)).toBe('ok second');   // fixed secret: no redeploy needed
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
