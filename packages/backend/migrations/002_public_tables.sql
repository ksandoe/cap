-- =============================================================================
-- CAP Migration 002 — Public schema tables
-- Run order: after 001
-- Description: All operational content tables.
--   recipes          — instructional recipes with full version history
--   module_config    — per-module operational settings
--   admin_users      — admin app users (roles: author, instructor, researcher, admin)
--   audit_log        — operational event log (90-day retention, no student PII)
--   validation_log   — append-only recipe notes from authors and instructors
--   module_irb_config— IRB approval status per module (gates research data collection)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------------------
-- Stores the full instructional recipe JSON for each module version.
-- One recipe per (module_id, version) pair. Only one version can be active
-- at a time per module_id.
--
-- The recipe JSONB column stores the full Recipe type from packages/shared:
--   module_title, module_description, learning_outcomes[], key_concepts[],
--   steps[] (each with blocks[]), rubric_dimensions[],
--   probing_rules[], vague_answer_triggers[], career_transfer_prompts[],
--   tone_guidance, max_turns, content_stub, background_docs[]
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recipes (
    recipe_id       UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id       TEXT            NOT NULL,
    version         INTEGER         NOT NULL,
    module_title    TEXT            NOT NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT FALSE,
    recipe_data     JSONB           NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT recipes_module_version_unique UNIQUE (module_id, version)
);

-- Only one active recipe per module
CREATE UNIQUE INDEX IF NOT EXISTS recipes_active_module_idx
    ON public.recipes (module_id)
    WHERE is_active = TRUE;

-- Fast lookup of active recipe by module
CREATE INDEX IF NOT EXISTS recipes_module_active_idx
    ON public.recipes (module_id, is_active);

-- Full-text search on module title (useful for admin app recipe list)
CREATE INDEX IF NOT EXISTS recipes_title_idx
    ON public.recipes USING gin(to_tsvector('english', module_title));

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recipes_updated_at
    BEFORE UPDATE ON public.recipes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------------
-- module_config
-- ---------------------------------------------------------------------------
-- Per-module operational settings. Decoupled from the recipe so that
-- infrastructure settings (SAP doc types, badge ID, retry limit) can be
-- changed without creating a new recipe version.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.module_config (
    module_id               TEXT        PRIMARY KEY,
    recipe_id               UUID        REFERENCES public.recipes(recipe_id),
    -- SAP verification (Phase 2+; ignored in Phase 1 stub mode)
    required_sap_doc_types  TEXT[]      NOT NULL DEFAULT '{}',
    sap_timeout_seconds     INTEGER     NOT NULL DEFAULT 15,
    -- Badge issuance (Phase 2+; null = no badge)
    badge_template_id       TEXT,
    -- Scoring
    score_map_pass          NUMERIC(3,2) NOT NULL DEFAULT 1.0,
    score_map_partial       NUMERIC(3,2) NOT NULL DEFAULT 0.5,
    score_map_fail          NUMERIC(3,2) NOT NULL DEFAULT 0.0,
    -- Session management
    retry_limit             INTEGER     NOT NULL DEFAULT 2,
    max_session_age_hours   INTEGER     NOT NULL DEFAULT 8,
    -- Phase 1 stub flags
    sap_stub_enabled        BOOLEAN     NOT NULL DEFAULT TRUE,
    -- Metadata
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER module_config_updated_at
    BEFORE UPDATE ON public.module_config
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------------------
-- Users of the Admin App. In Phase 1 this is a simple email + bcrypt password
-- table. In Phase 2 it will be replaced or supplemented by institutional SSO
-- (SAML/OIDC), at which point the password_hash column becomes nullable.
--
-- Roles:
--   author     — can create and edit recipes
--   instructor — can view sessions, transcripts, and export results
--   researcher — can query de-identified research data (IRB-gated)
--   admin      — full access to all modules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT        NOT NULL UNIQUE,
    password_hash   TEXT,                       -- nullable for SSO-only users
    role            TEXT        NOT NULL CHECK (role IN ('author','instructor','researcher','admin')),
    display_name    TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER admin_users_updated_at
    BEFORE UPDATE ON public.admin_users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
-- Operational event log. Written by the backend event logger for every
-- significant platform event. No student PII — records carry only
-- session_id (ephemeral, not linked to student identity in Aurora),
-- temp_user_id, and module_id.
--
-- Retention: 90 days. A scheduled job (or DynamoDB TTL equivalent) should
-- archive or delete rows older than 90 days.
--
-- Severity: INFO | WARN | ERROR
-- Source:   the backend service that emitted the event
--           e.g. 'lti-service', 'sap-connector', 'assessment-service'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
    log_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      TEXT        NOT NULL,
    severity        TEXT        NOT NULL CHECK (severity IN ('INFO','WARN','ERROR')),
    source          TEXT        NOT NULL,
    session_id      TEXT,                   -- DynamoDB session ID (ephemeral ref)
    temp_user_id    TEXT,                   -- 'tempuser_<uuid>' — no PII
    module_id       TEXT,
    payload         JSONB,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by session (for support queries)
CREATE INDEX IF NOT EXISTS audit_log_session_idx
    ON public.audit_log (session_id)
    WHERE session_id IS NOT NULL;

-- Fast lookup by severity for dashboard error surfacing
CREATE INDEX IF NOT EXISTS audit_log_severity_idx
    ON public.audit_log (severity, occurred_at DESC);

-- Fast lookup by module
CREATE INDEX IF NOT EXISTS audit_log_module_idx
    ON public.audit_log (module_id, occurred_at DESC)
    WHERE module_id IS NOT NULL;

-- Retention index (for the cleanup job)
CREATE INDEX IF NOT EXISTS audit_log_occurred_at_idx
    ON public.audit_log (occurred_at);


-- ---------------------------------------------------------------------------
-- validation_log
-- ---------------------------------------------------------------------------
-- Append-only notes from authors and instructors against a specific recipe
-- version. Used to track what was observed in real sessions and inform
-- future recipe revisions. Records cannot be edited or deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.validation_log (
    log_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id       UUID        NOT NULL REFERENCES public.recipes(recipe_id),
    module_id       TEXT        NOT NULL,
    author_role     TEXT        NOT NULL CHECK (author_role IN ('author','instructor')),
    note_text       TEXT        NOT NULL CHECK (char_length(note_text) <= 1000),
    -- Optional: session_id that prompted the note (no PII link — ephemeral ref)
    session_ref     TEXT,
    -- Optional: dimension that was flagged (for instructor evaluation reviews)
    flagged_dimension   TEXT,
    flag_type           TEXT    CHECK (flag_type IN ('agree','partially_agree','disagree')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS validation_log_recipe_idx
    ON public.validation_log (recipe_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- module_irb_config
-- ---------------------------------------------------------------------------
-- IRB approval status per module. The research.* tables are only populated
-- for sessions associated with a module where approved = TRUE and
-- consent_config is set. The application enforces this check at write time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.module_irb_config (
    module_id       TEXT        PRIMARY KEY,
    approved        BOOLEAN     NOT NULL DEFAULT FALSE,
    irb_protocol_id TEXT,                   -- institutional IRB protocol number
    consent_config  TEXT,                   -- describes the consent condition
    approved_at     TIMESTAMPTZ,
    approved_by     TEXT,                   -- admin_user email
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER module_irb_config_updated_at
    BEFORE UPDATE ON public.module_irb_config
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


INSERT INTO public.schema_migrations (version, description)
VALUES ('002', 'Public schema tables')
ON CONFLICT (version) DO NOTHING;
