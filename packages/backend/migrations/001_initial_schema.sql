-- 001_initial_schema.sql — public schema (operational content)
-- Master PRD §5.2 / infra/aurora.md. No student PII is stored here.

CREATE TABLE IF NOT EXISTS recipes (
  recipe_id          uuid        NOT NULL,
  module_id          text        NOT NULL,
  version            int         NOT NULL,
  payload            jsonb       NOT NULL,   -- full Recipe document (shared/src/types/recipe.ts)
  is_active          boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module_id, version)
);
-- Only one active version per module
CREATE UNIQUE INDEX IF NOT EXISTS recipes_one_active
  ON recipes (module_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS module_config (
  module_id             text PRIMARY KEY,
  recipe_id             uuid,                 -- links to active recipe
  required_sap_doc_types text[]    NOT NULL DEFAULT '{}',
  badge_template_id     text,
  score_mapping         jsonb      NOT NULL DEFAULT '{"badge":1.0,"partial":0.5,"below":0.0}',
  retry_limit           int        NOT NULL DEFAULT 2,
  sap_timeout_seconds   int        NOT NULL DEFAULT 15,
  max_session_age_hours int        NOT NULL DEFAULT 8,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_users (
  email            text PRIMARY KEY,
  hashed_password  text NOT NULL,
  role             text NOT NULL CHECK (role IN ('author','instructor','researcher','admin')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Operational event log; 90-day retention enforced by a scheduled delete,
-- not by schema. Payload carries sessionId/moduleId only — no student PII.
CREATE TABLE IF NOT EXISTS audit_log (
  event_id    uuid PRIMARY KEY,
  event_type  text        NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  severity    text        NOT NULL CHECK (severity IN ('INFO','WARN','ERROR')),
  source      text        NOT NULL DEFAULT 'backend',
  payload     jsonb       NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS audit_log_occurred_at ON audit_log (occurred_at);
CREATE INDEX IF NOT EXISTS audit_log_event_type  ON audit_log (event_type);
CREATE INDEX IF NOT EXISTS audit_log_severity    ON audit_log (severity);

-- Append-only notes on recipe versions (authors + instructors).
CREATE TABLE IF NOT EXISTS validation_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   uuid        NOT NULL,
  module_id   text        NOT NULL,
  version     int,
  role        text        NOT NULL CHECK (role IN ('author','instructor')),
  note        text        NOT NULL CHECK (char_length(note) <= 1000),
  is_flag     boolean     NOT NULL DEFAULT false,  -- instructor disagreement flag
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS validation_log_recipe ON validation_log (recipe_id, module_id);

-- IRB approval + consent configuration per module (gates research.* writes).
CREATE TABLE IF NOT EXISTS module_irb_config (
  module_id      text PRIMARY KEY,
  approved       boolean     NOT NULL DEFAULT false,
  consent_config text,                     -- IRB protocol / consent condition identifier
  approved_by    text,                     -- admin role identifier (not personal identity)
  approved_at    timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- down migration

DROP TABLE IF EXISTS module_irb_config;
DROP TABLE IF EXISTS validation_log;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS admin_users;
DROP TABLE IF EXISTS module_config;
DROP TABLE IF EXISTS recipes;
