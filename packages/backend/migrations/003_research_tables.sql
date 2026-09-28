-- =============================================================================
-- CAP Migration 003 — Research schema tables
-- Run order: after 002
-- Description: De-identified research data tables.
--
-- FERPA / IRB NOTICE:
--   These tables are created by this migration but must NOT be populated
--   until module_irb_config.approved = TRUE for the relevant module.
--   The application enforces this check before any INSERT.
--   Creating the tables here does not enable data collection.
--
-- De-identification rules (applied before any INSERT):
--   1. No direct student identifiers — no name, email, Canvas UUID, SAP username.
--   2. Sessions linked by research_session_id (UUID) only — not the DynamoDB
--      session_id, which is ephemeral and unlinkable.
--   3. All timestamps stored as INTEGER seconds elapsed since session start
--      (offset from 0), not wall-clock times. This prevents timing-based
--      re-identification.
--   4. Transcript content passed through a PII text filter before storage
--      (strips email patterns, "My name is X", student ID patterns).
--   5. cohort_id = module_id + academic period (e.g. 'SAP-SALES-2026-FALL').
--      Not student-specific. Allows cohort analysis without individual tracking.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- research.sessions
-- ---------------------------------------------------------------------------
-- One record per student session, written on completion after de-identification.
-- research_session_id is a new UUID generated at write time — it is NOT the
-- same as the DynamoDB session_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research.sessions (
    research_session_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id           TEXT        NOT NULL,
    cohort_id           TEXT        NOT NULL,   -- module_id + academic period
    consent_config      TEXT        NOT NULL,   -- IRB protocol identifier
    attempt_number      INTEGER     NOT NULL DEFAULT 1,
    phase_reached       INTEGER     NOT NULL,
    completion_status   TEXT        NOT NULL
                            CHECK (completion_status IN ('completed','incomplete','expired')),
    badge_awarded       BOOLEAN     NOT NULL DEFAULT FALSE,
    -- All timing is relative offsets in seconds from session start (= 0)
    started_at_offset   INTEGER     NOT NULL DEFAULT 0,
    completed_at_offset INTEGER,               -- null if not completed
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- wall-clock write time only
);

CREATE INDEX IF NOT EXISTS research_sessions_module_idx
    ON research.sessions (module_id, cohort_id);

CREATE INDEX IF NOT EXISTS research_sessions_completion_idx
    ON research.sessions (completion_status, badge_awarded);


-- ---------------------------------------------------------------------------
-- research.checkin_responses
-- ---------------------------------------------------------------------------
-- De-identified check-in question/response pairs.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research.checkin_responses (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    research_session_id UUID        NOT NULL REFERENCES research.sessions(research_session_id) ON DELETE CASCADE,
    question_key        TEXT        NOT NULL,
    question_text       TEXT        NOT NULL,
    response_type       TEXT        NOT NULL CHECK (response_type IN ('likert','multiple_choice','short_text')),
    response_value      TEXT        NOT NULL,   -- stored as text regardless of original type
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS research_checkin_session_idx
    ON research.checkin_responses (research_session_id);


-- ---------------------------------------------------------------------------
-- research.transcripts
-- ---------------------------------------------------------------------------
-- De-identified conversation turns. Content has been passed through the
-- PII filter before storage. Timestamp is seconds from session start.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research.transcripts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    research_session_id UUID        NOT NULL REFERENCES research.sessions(research_session_id) ON DELETE CASCADE,
    turn_number         INTEGER     NOT NULL,
    role                TEXT        NOT NULL CHECK (role IN ('agent','student')),
    content             TEXT        NOT NULL,   -- PII-filtered
    offset_seconds      INTEGER     NOT NULL,   -- seconds from session start
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT research_transcripts_session_turn UNIQUE (research_session_id, turn_number)
);

CREATE INDEX IF NOT EXISTS research_transcripts_session_idx
    ON research.transcripts (research_session_id, turn_number);


-- ---------------------------------------------------------------------------
-- research.evaluations
-- ---------------------------------------------------------------------------
-- De-identified evaluation results. One record per research session.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research.evaluations (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    research_session_id UUID        NOT NULL UNIQUE
                            REFERENCES research.sessions(research_session_id) ON DELETE CASCADE,
    dimension_ratings   JSONB       NOT NULL,
        -- [{dimensionName, rating: 'Strong'|'Developing'|'Needs further work', narrative}]
    outcome_summary     JSONB       NOT NULL,
        -- [{outcomeIndex, status: 'achieved'|'partial'|'not_addressed'}]
    overall_summary     TEXT        NOT NULL,
    badge_awarded       BOOLEAN     NOT NULL DEFAULT FALSE,
    assessed_at_offset  INTEGER     NOT NULL,   -- seconds from session start
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- research.interaction_timing
-- ---------------------------------------------------------------------------
-- Time-on-task data per content block. Useful for identifying which blocks
-- students find difficult or skip. Offset is seconds from session start.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research.interaction_timing (
    id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    research_session_id     UUID    NOT NULL
                                REFERENCES research.sessions(research_session_id) ON DELETE CASCADE,
    block_id                TEXT    NOT NULL,
    block_type              TEXT    NOT NULL
                                CHECK (block_type IN ('conceptual','instructional','sap')),
    time_on_block_seconds   INTEGER NOT NULL DEFAULT 0,
    step_sequence_observed  INTEGER[],          -- order in which steps were visited
    first_visit_offset      INTEGER NOT NULL,   -- seconds from session start
    last_visit_offset       INTEGER NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS research_timing_session_idx
    ON research.interaction_timing (research_session_id);

CREATE INDEX IF NOT EXISTS research_timing_block_idx
    ON research.interaction_timing (block_id, block_type);


INSERT INTO public.schema_migrations (version, description)
VALUES ('003', 'Research schema tables')
ON CONFLICT (version) DO NOTHING;
