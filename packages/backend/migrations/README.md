# CAP Database Migrations

PostgreSQL migrations for the Conversational Assessment Platform.
Target: Aurora PostgreSQL Serverless v2 (PostgreSQL 15+).

## Prerequisites

- PostgreSQL 15+ (Aurora Serverless v2 recommended)
- A database created and a user with CREATE SCHEMA / CREATE TABLE privileges
- `pgcrypto` extension: built into PostgreSQL 13+. If on PostgreSQL 12 or earlier,
  add `CREATE EXTENSION IF NOT EXISTS pgcrypto;` to the top of 001 before running.

## Run order

```bash
psql -h <your-aurora-endpoint> -U <master-user> -d <database-name> \
  -f 001_create_schemas.sql \
  -f 002_public_tables.sql \
  -f 003_research_tables.sql \
  -f 004_seed_sap_sales_recipe.sql
```

Or one at a time (recommended for first run so you can catch errors):

```bash
psql -h HOST -U USER -d DB -f 001_create_schemas.sql && echo "001 OK"
psql -h HOST -U USER -d DB -f 002_public_tables.sql && echo "002 OK"
psql -h HOST -U USER -d DB -f 003_research_tables.sql && echo "003 OK"
psql -h HOST -U USER -d DB -f 004_seed_sap_sales_recipe.sql && echo "004 OK"
```

## Before running 004

The seed file creates a default admin user with email `admin@example.com`
and a placeholder bcrypt hash. **Replace the hash before running:**

```bash
node -e "const b = require('bcrypt'); b.hash('your-password', 12).then(console.log)"
```

Then edit line ~220 of `004_seed_sap_sales_recipe.sql` and replace the
`password_hash` value with your generated hash.

## What gets created

| Migration | Creates |
|-----------|---------|
| 001       | `public` schema (already exists), `research` schema, `schema_migrations` table |
| 002       | `recipes`, `module_config`, `admin_users`, `audit_log`, `validation_log`, `module_irb_config` |
| 003       | `research.sessions`, `research.checkin_responses`, `research.transcripts`, `research.evaluations`, `research.interaction_timing` |
| 004       | SAP Sales Process recipe (v1, active), module config, IRB config (not approved), default admin user |

## Verify after running

```sql
-- Check migrations applied
SELECT version, description, applied_at FROM public.schema_migrations ORDER BY version;

-- Check recipe loaded
SELECT module_id, version, module_title, is_active FROM public.recipes;

-- Check module config
SELECT module_id, sap_stub_enabled, retry_limit FROM public.module_config;

-- Check tables exist
SELECT schemaname, tablename FROM pg_tables
WHERE schemaname IN ('public','research')
ORDER BY schemaname, tablename;
```

## Re-running safely

All `CREATE TABLE` statements use `IF NOT EXISTS`. Migrations 001–003 are
idempotent and safe to re-run. Migration 004 uses `ON CONFLICT DO NOTHING`
guards on all inserts, so it is also safe to re-run — it will not duplicate
the recipe or admin user. The schema_migrations table tracks what has run.
