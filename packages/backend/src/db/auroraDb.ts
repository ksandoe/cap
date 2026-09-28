/**
 * auroraDb.ts — Aurora PostgreSQL client.
 *
 * Two drivers, selected by environment:
 *   - Direct pg connection when AURORA_DATABASE_URL (or DATABASE_URL) is set.
 *     Used for local dev and migrations. Also works against Aurora directly
 *     if the cluster is network-reachable.
 *   - AWS RDS Data API when AURORA_RESOURCE_ARN + AURORA_SECRET_ARN are set.
 *     Preferred in Lambda — no persistent connection management.
 *
 * Tables (Aurora PostgreSQL, Master PRD Section 5.2 — see infra/aurora.md):
 *
 *   public schema:
 *     recipes              — instructional recipes with version history
 *     module_config        — per-module operational settings
 *     admin_users          — admin app users (email, hashed_password, role)
 *     audit_log            — operational event log (90-day retention)
 *     validation_log       — recipe notes from authors and instructors
 *     module_irb_config    — IRB approval status per module
 *
 *   research schema (IRB-gated — must not be populated before approval):
 *     research.sessions            — de-identified session records
 *     research.checkin_responses   — de-identified check-in responses
 *     research.transcripts         — de-identified conversation turns
 *     research.evaluations         — de-identified evaluation results
 *     research.interaction_timing  — content block timing data
 *
 * Migrations live in packages/backend/migrations/ (node-pg-migrate).
 */
import {
  RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand,
  CommitTransactionCommand, RollbackTransactionCommand, Field,
} from '@aws-sdk/client-rds-data';

export interface QueryResult<T = Record<string, unknown>> {
  rows:  T[];
  count: number;
}

const DATABASE_URL = process.env.AURORA_DATABASE_URL ?? process.env.DATABASE_URL;
const RESOURCE_ARN = process.env.AURORA_RESOURCE_ARN;
const SECRET_ARN   = process.env.AURORA_SECRET_ARN;
const DATABASE     = process.env.AURORA_DATABASE ?? 'cap_prod';

/** True when enough env is present to reach Aurora by either driver. */
export function auroraConfigured(): boolean {
  return Boolean(DATABASE_URL || (RESOURCE_ARN && SECRET_ARN));
}

// ── Direct pg driver ─────────────────────────────────────────────────────────

let _pool: import('pg').Pool | null = null;
async function pgPool(): Promise<import('pg').Pool> {
  if (!_pool) {
    const { Pool } = await import('pg');
    _pool = new Pool({ connectionString: DATABASE_URL });
  }
  return _pool;
}

async function pgQuery<T>(sql: string, params: unknown[]): Promise<QueryResult<T>> {
  const pool = await pgPool();
  const r = await pool.query(sql, params as any[]);
  return { rows: r.rows as T[], count: r.rowCount ?? r.rows.length };
}

// ── RDS Data API driver ───────────────────────────────────────────────────────

const rds = new RDSDataClient({ region: process.env.AWS_REGION });

/** JS value → RDS Data API Field */
function toField(v: unknown): Field {
  if (v === null || v === undefined) return { isNull: true };
  if (typeof v === 'boolean')        return { booleanValue: v };
  if (typeof v === 'number')
    return Number.isInteger(v) ? { longValue: v } : { doubleValue: v };
  if (v instanceof Date)             return { stringValue: v.toISOString() };
  if (typeof v === 'object')         return { stringValue: JSON.stringify(v) };
  return { stringValue: String(v) };
}

/** Convert $1..$n positional params to Data API named params :p1..:pn. */
function dataApiParams(sql: string, params: unknown[]) {
  const namedSql = sql.replace(/\$(\d+)/g, ':p$1');
  const named    = params.map((v, i) => ({ name: `p${i + 1}`, value: toField(v) }));
  return { namedSql, named };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function recordsToRows<T>(records: any[][] | undefined, columns: any[] | undefined): T[] {
  if (!records?.length || !columns?.length) return [];
  const names = columns.map((c: any) => c.name ?? c.label);
  return records.map(rec =>
    Object.fromEntries(rec.map((f: any, i: number) => [
      names[i],
      f.isNull ? null
        : f.stringValue ?? f.longValue ?? f.doubleValue ?? f.booleanValue ?? null,
    ])) as T,
  );
}

async function dataApiStatement(sql: string, params: unknown[], transactionId?: string) {
  const { namedSql, named } = dataApiParams(sql, params);
  return rds.send(new ExecuteStatementCommand({
    resourceArn: RESOURCE_ARN, secretArn: SECRET_ARN, database: DATABASE,
    sql: namedSql, parameters: named, includeResultMetadata: true,
    transactionId,
  }));
}

async function dataApiQuery<T>(sql: string, params: unknown[], transactionId?: string): Promise<QueryResult<T>> {
  const r = await dataApiStatement(sql, params, transactionId);
  return {
    rows:  recordsToRows<T>(r.records, r.columnMetadata),
    count: r.numberOfRecordsUpdated ?? r.records?.length ?? 0,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Execute a parameterised SQL query. Use $1..$n positional placeholders;
 * they are translated to named parameters automatically for the Data API.
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  if (DATABASE_URL) return pgQuery<T>(sql, params);
  if (RESOURCE_ARN && SECRET_ARN) return dataApiQuery<T>(sql, params);
  throw new Error(
    'Aurora not configured: set AURORA_DATABASE_URL (direct pg) or ' +
    'AURORA_RESOURCE_ARN + AURORA_SECRET_ARN (RDS Data API).',
  );
}

/**
 * Execute multiple queries in a single transaction.
 */
export async function transaction(
  queries: { sql: string; params: unknown[] }[],
): Promise<void> {
  if (DATABASE_URL) {
    const pool   = await pgPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const q of queries) await client.query(q.sql, q.params as any[]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return;
  }

  if (RESOURCE_ARN && SECRET_ARN) {
    const tx = await rds.send(new BeginTransactionCommand({
      resourceArn: RESOURCE_ARN, secretArn: SECRET_ARN, database: DATABASE,
    }));
    try {
      for (const q of queries) await dataApiStatement(q.sql, q.params, tx.transactionId);
      await rds.send(new CommitTransactionCommand({
        resourceArn: RESOURCE_ARN, secretArn: SECRET_ARN, transactionId: tx.transactionId,
      }));
    } catch (err) {
      await rds.send(new RollbackTransactionCommand({
        resourceArn: RESOURCE_ARN, secretArn: SECRET_ARN, transactionId: tx.transactionId,
      }));
      throw err;
    }
    return;
  }

  throw new Error('Aurora not configured — see query().');
}
