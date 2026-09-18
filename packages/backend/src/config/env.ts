/**
 * env.ts — Environment loading. Imported first in app.ts so that
 * process.env is populated before any module reads it at load time.
 *
 * Loads the repo-root .env (shared local dev config) and then a
 * package-local .env if present (overrides).
 *
 * External integrations are individually switchable so each can go
 * live independently as campus credentials arrive:
 *
 *   USE_LOCAL_DB=true   persistence: JSON-file store instead of DynamoDB
 *   LLM_MODE=mock|openai           checkout conversation + evaluation
 *   SAP_MODE=stub|live             SAP OData document verification
 *   CANVAS_MODE=stub|live          AGS grade posting (LTI launch is always
 *                                  real code; /dev/launch simulates it in dev)
 *   CREDLY_MODE=stub|live          badge issuance
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

type Mode = 'stub' | 'live';
function mode(envVar: string, fallback: Mode): Mode {
  const v = (process.env[envVar] ?? '').toLowerCase();
  return v === 'live' ? 'live' : v === 'stub' ? 'stub' : fallback;
}

// Integration switches. In local dev everything defaults to stub so the
// app runs with zero external credentials; each flips to 'live' independently.
const devFallback: Mode = USE_LOCAL_DB ? 'stub' : 'live';
export const SAP_MODE    = mode('SAP_MODE',    devFallback);
export const CANVAS_MODE = mode('CANVAS_MODE', devFallback);
export const CREDLY_MODE = mode('CREDLY_MODE', devFallback);

// LLM: explicit LLM_MODE wins; otherwise real calls when a key exists, mock otherwise.
export const LLM_MODE: 'mock' | 'openai' =
  process.env.LLM_MODE === 'openai' ? 'openai'
  : process.env.LLM_MODE === 'mock' ? 'mock'
  : process.env.OPENAI_API_KEY ? 'openai'
  : 'mock';

export const MOCK_AI = LLM_MODE === 'mock';
