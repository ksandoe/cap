/**
 * env.ts — Environment loading. Imported first in app.ts so that
 * process.env is populated before any module reads it at load time.
 *
 * Loads the repo-root .env (shared local dev config) and then a
 * package-local .env if present (overrides).
 */
import path from 'path';
import dotenv from 'dotenv';

// __dirname = packages/backend/src/config → repo root is four levels up
const rootEnv    = path.resolve(__dirname, '../../../../.env');
const packageEnv = path.resolve(__dirname, '../../.env');

dotenv.config({ path: rootEnv });
dotenv.config({ path: packageEnv });

/** True when running against the local JSON-file store instead of DynamoDB. */
export const USE_LOCAL_DB = process.env.USE_LOCAL_DB === 'true';

/** True when AI calls should be answered with canned mock responses. */
export const MOCK_AI =
  process.env.MOCK_AI === 'true' ||
  (!process.env.ANTHROPIC_API_KEY && process.env.NODE_ENV !== 'production');
