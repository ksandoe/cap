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
 *   - A name may live in only ONE secret. The same name in two is refused, so it is never
 *     unclear which value is used.
 *   - A variable already set on the function wins over a secret. That lets you move the
 *     values one at a time and check each, and a stale variable you forgot to delete is
 *     reported (by name) as "also set as an environment variable".
 *   - All-or-nothing: every secret is read and checked BEFORE anything is copied into the
 *     environment. If any cannot be read, is malformed, or conflicts, this throws, nothing
 *     is applied, and the function does not serve requests. It never falls back to a default.
 *   - It logs names only. No value, and no part of one, is ever logged or put in an error.
 */
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

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

export interface SecretsClientLike {
  send(command: unknown): Promise<{ SecretString?: string; SecretBinary?: unknown }>;
}

export interface SecretsLoadResult {
  /** 'none' when APP_SECRETS_ID is not set and nothing was read. */
  source: 'none' | 'secrets-manager';
  /** The secrets that were read, in order. */
  secretIds: string[];
  /** Names copied from the secrets into the environment. */
  fromSecret: string[];
  /** Names that were in a secret but already set on the function, which wins. */
  keptFromEnv: string[];
  /** Names in a secret that are not allowed and were ignored. */
  ignored: string[];
}

function failure(message: string): Error {
  return Object.assign(new Error(`Secrets Manager: ${message}`), { statusCode: 500, code: 'SECRETS_LOAD_FAILED' });
}

/** The secrets named by APP_SECRETS_ID: comma-separated, blanks and repeats dropped. */
export function parseSecretIds(raw: string | undefined): string[] {
  const ids = (raw ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return [...new Set(ids)];
}

interface ReadSecret { id: string; values: Record<string, string>; ignored: string[] }

async function readSecret(id: string, client: SecretsClientLike): Promise<ReadSecret> {
  let response: { SecretString?: string; SecretBinary?: unknown };
  try {
    response = await client.send(new GetSecretValueCommand({ SecretId: id }));
  } catch (err) {
    // The error's name (AccessDeniedException, ResourceNotFoundException, ...) says what is
    // wrong. Its message is not copied: it can quote the request.
    throw failure(`could not read the secret "${id}" (${(err as Error)?.name ?? 'unknown error'}). `
      + 'Check that it exists and that the function\'s role is allowed to read it (see infra/secrets.md).');
  }

  if (typeof response.SecretString !== 'string') {
    throw failure(`the secret "${id}" is not a text secret. Store it as key/value pairs (JSON).`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.SecretString);
  } catch {
    throw failure(`the secret "${id}" is not valid JSON. Store it as key/value pairs.`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw failure(`the secret "${id}" must be a JSON object of name: value pairs.`);
  }

  const allowed = new Set<string>(SECRET_KEYS);
  const values: Record<string, string> = {};
  const ignored: string[] = [];
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!allowed.has(name)) { ignored.push(name); continue; }
    if (typeof value !== 'string' || value.trim() === '') {
      throw failure(`${name} in the secret "${id}" must be a non-empty text value.`);
    }
    values[name] = value;
  }
  return { id, values, ignored };
}

export async function loadSecretsIntoEnv(
  opts: { env?: NodeJS.ProcessEnv; client?: SecretsClientLike } = {},
): Promise<SecretsLoadResult> {
  const env = opts.env ?? process.env;
  const ids = parseSecretIds(env.APP_SECRETS_ID);
  if (!ids.length) return { source: 'none', secretIds: [], fromSecret: [], keptFromEnv: [], ignored: [] };

  const client: SecretsClientLike = opts.client
    ?? (new SecretsManagerClient({ region: env.AWS_REGION }) as unknown as SecretsClientLike);

  // 1. Read and check every secret first. Nothing touches the environment yet, so a failure
  //    part-way leaves it exactly as it was.
  const secrets: ReadSecret[] = [];
  for (const id of ids) secrets.push(await readSecret(id, client));

  const owner = new Map<string, string>();
  for (const secret of secrets) {
    for (const name of Object.keys(secret.values)) {
      const first = owner.get(name);
      if (first !== undefined) {
        throw failure(`${name} is in both "${first}" and "${secret.id}". A setting must live in exactly one secret.`);
      }
      owner.set(name, secret.id);
    }
  }

  // 2. Apply. A variable already set on the function wins.
  const result: SecretsLoadResult = { source: 'secrets-manager', secretIds: ids, fromSecret: [], keptFromEnv: [], ignored: [] };
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
  return result;
}
