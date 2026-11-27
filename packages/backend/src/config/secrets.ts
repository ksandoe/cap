/**
 * secrets.ts — A secret may have a built-in default ONLY for local development.
 *
 * Three secrets used to fall back to a default written in the source (and, for the
 * passkey, in the README) when their environment variable was missing:
 *
 *   SESSION_JWT_SECRET  signs every session token, student and admin
 *   LEARNER_KEY_SECRET  derives each student's permanent ID
 *   ADMIN_PASSKEY       signs a person in to the admin app as admin
 *
 * On a deployed function a missing variable then went unnoticed: tokens signed with a
 * public secret can be forged (an admin token included), and the public passkey signs
 * in as admin. So the defaults now apply only when running against the local JSON store
 * (`USE_LOCAL_DB=true`: `npm run dev`, and the tests). Anywhere else a missing value, or
 * a value equal to the public default, is refused. Nothing here logs or returns a value.
 */

export const DEV_DEFAULTS = {
  SESSION_JWT_SECRET: 'dev-secret-change-me',
  LEARNER_KEY_SECRET: 'dev-learner-key-change-me',
  ADMIN_PASSKEY:      'cap-team-2026',
} as const;

/** True only when running against the local JSON store. A deployed function sets
 *  USE_LOCAL_DB=false (or leaves it unset), so it is never "local development". */
export function isLocalDevelopment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.USE_LOCAL_DB === 'true';
}

function notConfigured(name: string, why: string): Error {
  return Object.assign(
    new Error(`${name} ${why}. A deployed function needs its own long random value for it (see infra/lambda.md).`),
    { statusCode: 500, code: 'SECRET_NOT_CONFIGURED' },
  );
}

/**
 * A token or learner-key secret. Local development falls back to the dev default;
 * anywhere else it must be set and must not be the public default.
 */
export function requireSecret(
  name: 'SESSION_JWT_SECRET' | 'LEARNER_KEY_SECRET',
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env[name]?.trim();
  if (isLocalDevelopment(env)) return value || DEV_DEFAULTS[name];
  if (!value) throw notConfigured(name, 'is not set');
  if (value === DEV_DEFAULTS[name]) throw notConfigured(name, 'is set to the public development default');
  return value;
}

/**
 * The admin passkey to compare a sign-in attempt against: a stored override (set in the
 * admin app) wins over the environment variable. Returns null when admin sign-in is not
 * configured on a deployed function, in which case sign-in must be refused. Local
 * development falls back to the dev default.
 */
export function resolvePasskey(
  stored: string | undefined | null,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const configured = (stored?.trim() || env.ADMIN_PASSKEY?.trim()) || undefined;
  if (isLocalDevelopment(env)) return configured ?? DEV_DEFAULTS.ADMIN_PASSKEY;
  if (!configured || configured === DEV_DEFAULTS.ADMIN_PASSKEY) return null;
  return configured;
}

/**
 * Run once when the server starts. On a deployed function it throws, naming the variables
 * (never their values), if a token or learner-key secret is missing or is the public
 * default, so the function fails loudly instead of running insecurely. The passkey is
 * checked at sign-in instead, because a stored override can supply it.
 */
export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  if (isLocalDevelopment(env)) return;
  const problems: string[] = [];
  const short: string[] = [];
  for (const name of ['SESSION_JWT_SECRET', 'LEARNER_KEY_SECRET'] as const) {
    try {
      if (requireSecret(name, env).length < 32) short.push(name);
    } catch (err) {
      problems.push((err as Error).message);
    }
  }
  if (short.length) {
    console.warn(`[secrets] ${short.join(', ')} is shorter than 32 characters; use a longer random value.`);
  }
  if (problems.length) {
    throw new Error(`Refusing to start: ${problems.join(' ')}`);
  }
}
