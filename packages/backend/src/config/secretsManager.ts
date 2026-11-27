/**
 * secretsManager.ts — Load the sensitive settings from AWS Secrets Manager at start-up.
 *
 * Today the sensitive values are plain Lambda environment variables, readable by anyone
 * who can open the function in the console or run get-function-configuration. This moves
 * them into one Secrets Manager secret, with its own access control and an audit trail.
 *
 * How it works:
 *   - It is OFF unless the function has APP_SECRETS_ID (the secret's name or ARN). With it
 *     unset (local development, tests, a function not yet migrated) nothing changes.
 *   - The secret is one JSON object of string values, for example
 *     {"SESSION_JWT_SECRET": "...", "ADMIN_PASSKEY": "..."}.
 *   - Each value is copied into process.env, so the rest of the code reads settings exactly
 *     as before. This runs before the app module is imported (lambda/bootstrap.ts), so the
 *     start-up check in config/secrets.ts sees the loaded values.
 *   - ONLY the names in SECRET_KEYS are accepted. Anything else in the secret is ignored
 *     and reported by name, so a secret can never switch on USE_LOCAL_DB, change NODE_ENV
 *     or repoint a table.
 *   - A variable already set on the function wins over the secret. That lets you move the
 *     values one at a time and check each, and it means a stale variable you forgot to
 *     delete is reported (by name) as "still from the environment".
 *   - If the secret cannot be read, this throws and the function does not serve requests.
 *     It never falls back to a default.
 *   - It logs names only. No value, and no part of one, is ever logged or put in an error.
 */
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

/** The only names the secret may fill in. LTI_PRIVATE_KEY is for Canvas grade return. */
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
  /** Names copied from the secret into the environment. */
  fromSecret: string[];
  /** Names that were in the secret but already set on the function, which wins. */
  keptFromEnv: string[];
  /** Names in the secret that are not allowed and were ignored. */
  ignored: string[];
}

function failure(message: string): Error {
  return Object.assign(new Error(`Secrets Manager: ${message}`), { statusCode: 500, code: 'SECRETS_LOAD_FAILED' });
}

export async function loadSecretsIntoEnv(
  opts: { env?: NodeJS.ProcessEnv; client?: SecretsClientLike } = {},
): Promise<SecretsLoadResult> {
  const env = opts.env ?? process.env;
  const secretId = env.APP_SECRETS_ID?.trim();
  if (!secretId) return { source: 'none', fromSecret: [], keptFromEnv: [], ignored: [] };

  const client: SecretsClientLike = opts.client
    ?? (new SecretsManagerClient({ region: env.AWS_REGION }) as unknown as SecretsClientLike);

  let response: { SecretString?: string; SecretBinary?: unknown };
  try {
    response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  } catch (err) {
    // The error's name (AccessDeniedException, ResourceNotFoundException, ...) says what is
    // wrong. Its message is not copied: it can quote the request.
    throw failure(`could not read the secret "${secretId}" (${(err as Error)?.name ?? 'unknown error'}). `
      + 'Check that it exists and that the function\'s role is allowed to read it (see infra/secrets.md).');
  }

  if (typeof response.SecretString !== 'string') {
    throw failure(`the secret "${secretId}" is not a text secret. Store it as key/value pairs (JSON).`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.SecretString);
  } catch {
    throw failure(`the secret "${secretId}" is not valid JSON. Store it as key/value pairs.`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw failure(`the secret "${secretId}" must be a JSON object of name: value pairs.`);
  }

  const allowed = new Set<string>(SECRET_KEYS);
  const result: SecretsLoadResult = { source: 'secrets-manager', fromSecret: [], keptFromEnv: [], ignored: [] };

  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!allowed.has(name)) { result.ignored.push(name); continue; }
    if (typeof value !== 'string' || value.trim() === '') {
      throw failure(`${name} in the secret "${secretId}" must be a non-empty text value.`);
    }
    if (env[name]?.trim()) { result.keptFromEnv.push(name); continue; }
    env[name] = value;
    result.fromSecret.push(name);
  }

  // Names only. Never a value.
  console.log(`[secrets] from Secrets Manager: ${result.fromSecret.join(', ') || '(none)'}`);
  if (result.keptFromEnv.length) {
    console.warn(`[secrets] also set as environment variables, which win: ${result.keptFromEnv.join(', ')}. `
      + 'Delete these variables from the function once the secret is verified.');
  }
  if (result.ignored.length) {
    console.warn(`[secrets] ignored (not an allowed name): ${result.ignored.join(', ')}`);
  }
  return result;
}
