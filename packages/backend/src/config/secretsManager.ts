/**
 * secretsManager.ts — Load the sensitive settings from AWS Secrets Manager at start-up.
 *
 * Sensitive values used to be plain Lambda environment variables, readable by anyone who
 * can open the function in the console or run get-function-configuration. This moves them
 * into Secrets Manager, with its own access control and an audit trail.
 *
 * They are split into SEVERAL secrets by who may read them (see infra/secrets.md): the
 * runtime secrets that only the function and its owners read, and a small secret holding
 * only the Canvas key that a developer may also read. One secret would be one permission
 * boundary, so reading any of it would mean reading all of it.
 *
 * How it works:
 *   - It is OFF unless APP_SECRETS_ID is set. It names one secret, or several separated by
 *     commas ("cap/prod/app,cap/lti-dev"); each is a name or an ARN. With it unset (tests, a
 *     function not yet migrated) nothing changes.
 *   - Each secret is one JSON object of string values, for example
 *     {"SESSION_JWT_SECRET": "...", "ADMIN_PASSKEY": "..."}.
 *   - Each value is copied into process.env, so the rest of the code reads settings exactly
 *     as before. This runs before the app module is imported (lambda/bootstrap.ts, and the
 *     local server in app.ts), so the start-up check in config/secrets.ts sees the values.
 *   - ONLY the names in SECRET_KEYS are accepted. Anything else in a secret is ignored and
 *     reported by name, so a secret can never switch on USE_LOCAL_DB, change NODE_ENV or
 *     repoint a table.
 *   - A variable already set on the function wins over a secret. That lets you move the
 *     values one at a time and check each, and a stale variable you forgot to delete is
 *     reported (by name) as "also set as an environment variable".
 *
 * A BROKEN SECRET DOES NOT STOP THE APP, unless the app cannot start safely without it.
 *   - A secret that cannot be read, is not text, is not valid JSON, or is not an object is
 *     skipped. A single value that is not a non-empty text value is skipped (the rest of its
 *     secret still applies). A name found in two secrets is applied from neither, because
 *     which one is meant is unclear. Each of these is logged as an ERROR naming the secret or
 *     the name and the problem, so it is visible in CloudWatch, and is returned in `problems`.
 *   - The one exception is the pair the app cannot run safely without, REQUIRED_SECRET_KEYS
 *     (the session secret and the learner-key secret, which have public defaults in the source
 *     and so must never be missing). On a deployed function, if either is still missing from the
 *     environment after loading, this throws and the function does not serve requests, until it
 *     is fixed; the next request tries again, so no redeploy is needed. A broken optional secret,
 *     such as the Canvas key, must never take the site down: it has no public default, and
 *     whatever needs it fails clearly when used.
 *   - In local development a missing required name is not an error (the development defaults
 *     apply).
 *   - It never falls back to a default for a required secret on a deployed function.
 *
 * It logs names only. No value, and no part of one, is ever logged or put in an error, and the
 * AWS error text is never echoed (only its name, such as AccessDeniedException).
 */
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { isLocalDevelopment } from './secrets';

/** The only names a secret may fill in. LTI_PRIVATE_KEY is for Canvas grade return. */
export const SECRET_KEYS = [
  'SESSION_JWT_SECRET',
  'LEARNER_KEY_SECRET',
  'ADMIN_PASSKEY',
  'OPENAI_API_KEY',
  'SAP_CLIENT_SECRET',
  'DATABASE_URL',
  'LTI_PRIVATE_KEY',
] as const;

/** Names a deployed function cannot start safely without (see assertProductionSecrets). */
export const REQUIRED_SECRET_KEYS = ['SESSION_JWT_SECRET', 'LEARNER_KEY_SECRET'] as const;

export interface SecretsClientLike {
  send(command: unknown): Promise<{ SecretString?: string; SecretBinary?: unknown }>;
}

export interface SecretsLoadResult {
  /** 'none' when APP_SECRETS_ID is not set and nothing was read. */
  source: 'none' | 'secrets-manager';
  /** The secrets that were asked for, in order. */
  secretIds: string[];
  /** Names copied from the secrets into the environment. */
  fromSecret: string[];
  /** Names that were in a secret but already set on the function, which wins. */
  keptFromEnv: string[];
  /** Names in a secret that are not allowed and were ignored. */
  ignored: string[];
  /** What went wrong, in words, naming secrets and settings but never values. Empty when all is well. */
  problems: string[];
}

function failure(message: string): Error {
  return Object.assign(new Error(`Secrets Manager: ${message}`), { statusCode: 500, code: 'SECRETS_LOAD_FAILED' });
}

/** The secrets named by APP_SECRETS_ID: comma-separated, blanks and repeats dropped. */
export function parseSecretIds(raw: string | undefined): string[] {
  const ids = (raw ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return [...new Set(ids)];
}

interface ReadSecret { id: string; values: Record<string, string>; ignored: string[]; problems: string[] }

/** Reads one secret. Never throws: a problem is returned in `problems` and the secret, or the
 *  offending value, is skipped. */
async function readSecret(id: string, client: SecretsClientLike): Promise<ReadSecret> {
  const result: ReadSecret = { id, values: {}, ignored: [], problems: [] };
  const skip = (why: string) => { result.problems.push(`${why} It was skipped.`); return result; };

  let response: { SecretString?: string; SecretBinary?: unknown };
  try {
    response = await client.send(new GetSecretValueCommand({ SecretId: id }));
  } catch (err) {
    // The error's name (AccessDeniedException, ResourceNotFoundException, ...) says what is
    // wrong. Its message is not copied: it can quote the request.
    return skip(`Could not read the secret "${id}" (${(err as Error)?.name ?? 'unknown error'}). `
      + 'Check that it exists and that the function\'s role may read it (see infra/secrets.md).');
  }

  if (typeof response.SecretString !== 'string') {
    return skip(`The secret "${id}" is not a text secret. Store it as key/value pairs (JSON).`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.SecretString);
  } catch {
    return skip(`The secret "${id}" is not valid JSON. Store it as key/value pairs.`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return skip(`The secret "${id}" must be a JSON object of name: value pairs.`);
  }

  const allowed = new Set<string>(SECRET_KEYS);
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!allowed.has(name)) { result.ignored.push(name); continue; }
    if (typeof value !== 'string' || value.trim() === '') {
      // Only this setting is skipped; the rest of the secret still applies. (A key that was
      // stored as a nested object, a null or an empty string ends up here.)
      result.problems.push(`${name} in the secret "${id}" is not a non-empty text value. It was skipped.`);
      continue;
    }
    result.values[name] = value;
  }
  return result;
}

export async function loadSecretsIntoEnv(
  opts: { env?: NodeJS.ProcessEnv; client?: SecretsClientLike } = {},
): Promise<SecretsLoadResult> {
  const env = opts.env ?? process.env;
  const ids = parseSecretIds(env.APP_SECRETS_ID);
  if (!ids.length) return { source: 'none', secretIds: [], fromSecret: [], keptFromEnv: [], ignored: [], problems: [] };

  const client: SecretsClientLike = opts.client
    ?? (new SecretsManagerClient({ region: env.AWS_REGION }) as unknown as SecretsClientLike);

  // 1. Read and check every secret first. Nothing touches the environment yet.
  const secrets: ReadSecret[] = [];
  for (const id of ids) secrets.push(await readSecret(id, client));
  const problems = secrets.flatMap(s => s.problems);

  // A name in two secrets is applied from neither: which one is meant is unclear.
  const owners = new Map<string, string[]>();
  for (const secret of secrets) {
    for (const name of Object.keys(secret.values)) owners.set(name, [...(owners.get(name) ?? []), secret.id]);
  }
  for (const [name, where] of owners) {
    if (where.length < 2) continue;
    problems.push(`${name} is in both ${where.map(w => `"${w}"`).join(' and ')}. A setting must live in exactly one secret, `
      + 'so it was applied from neither.');
    for (const secret of secrets) delete secret.values[name];
  }

  // 2. Apply. A variable already set on the function wins.
  const result: SecretsLoadResult = { source: 'secrets-manager', secretIds: ids, fromSecret: [], keptFromEnv: [], ignored: [], problems };
  for (const secret of secrets) {
    const taken: string[] = [];
    const kept: string[] = [];
    for (const [name, value] of Object.entries(secret.values)) {
      if (env[name]?.trim()) { kept.push(name); continue; }
      env[name] = value;
      taken.push(name);
    }
    result.fromSecret.push(...taken);
    result.keptFromEnv.push(...kept);
    result.ignored.push(...secret.ignored);

    // Names only. Never a value.
    console.log(`[secrets] from "${secret.id}": ${taken.join(', ') || '(none)'}`);
    if (kept.length) {
      console.warn(`[secrets] "${secret.id}" also has ${kept.join(', ')} set as environment variables, which win. `
        + 'Delete those variables from the function once the secret is verified.');
    }
    if (secret.ignored.length) {
      console.warn(`[secrets] "${secret.id}": ignored (not an allowed name): ${secret.ignored.join(', ')}`);
    }
  }
  for (const problem of problems) console.error(`[secrets] ERROR: ${problem}`);

  // 3. The app cannot start safely without the required secrets, and they have public defaults
  //    in the source, so a deployed function must not run without them. Throwing here makes the
  //    next request try again, so a fixed secret needs no redeploy. Anything else that is broken
  //    has already been logged above and the app carries on.
  if (!isLocalDevelopment(env)) {
    const missing = REQUIRED_SECRET_KEYS.filter(name => !env[name]?.trim());
    if (missing.length) {
      throw failure(`${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} required and not set in the environment `
        + `or in any of the secrets named by APP_SECRETS_ID. ${problems.length ? `Problems: ${problems.join(' ')}` : ''}`.trim());
    }
  }
  return result;
}
