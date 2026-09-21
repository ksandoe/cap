/**
 * migrate.ts — Run Aurora migrations via node-pg-migrate.
 *
 * Usage:  npm run migrate -w packages/backend -- up|down [count]
 *
 * Requires AURORA_DATABASE_URL or DATABASE_URL (direct pg connection —
 * node-pg-migrate does not work over the RDS Data API). For an Aurora
 * cluster in a private subnet, run from a host with network access
 * (VPN/bastion) or wire this into the deploy pipeline.
 *
 * Loads the repo-root .env like config/env.ts does.
 */
import path from 'path';
import dotenv from 'dotenv';
import { runner } from 'node-pg-migrate';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.AURORA_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Set AURORA_DATABASE_URL or DATABASE_URL to run migrations.');
  process.exit(1);
}

const direction = (process.argv[2] === 'down' ? 'down' : 'up') as 'up' | 'down';
const count     = parseInt(process.argv[3] ?? '', 10);

runner({
  databaseUrl,
  dir:            path.resolve(__dirname, '../migrations'),
  direction,
  count:          Number.isNaN(count) ? undefined : count,
  migrationsTable: 'pgmigrations',
  verbose:        true,
})
  .then(() => { console.log('Migrations complete.'); process.exit(0); })
  .catch(err => { console.error('Migration failed:', err); process.exit(1); });
