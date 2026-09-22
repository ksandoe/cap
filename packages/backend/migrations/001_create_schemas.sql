-- =============================================================================
-- CAP Migration 001 — Create schemas
-- Run order: first
-- Description: Creates the two top-level schemas.
--   public   — operational content (recipes, config, admin users, audit log)
--   research — de-identified student interaction data (IRB-gated)
-- =============================================================================

-- research schema is created now but populated only after IRB approval.
-- The application checks module_irb_config.approved before writing any
-- research.* records. Creating the schema here does not enable data collection.

CREATE SCHEMA IF NOT EXISTS research;

-- Track which migrations have run
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version     TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    description TEXT
);

INSERT INTO public.schema_migrations (version, description)
VALUES ('001', 'Create schemas')
ON CONFLICT (version) DO NOTHING;
