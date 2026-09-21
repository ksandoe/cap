-- 002_research_schema.sql — de-identified research data (research.* schema)
-- Master PRD §5.2/§5.4. IRB-GATED: do not populate until
-- module_irb_config.approved = true for the module.
-- No direct student identifiers; timestamps are relative offsets.

CREATE SCHEMA IF NOT EXISTS research;

CREATE TABLE IF NOT EXISTS research.sessions (
  research_session_id  uuid PRIMARY KEY,   -- NOT linked to DynamoDB sessionId
  cohort_id            text NOT NULL,      -- moduleId + academic period
  consent_config       text NOT NULL,
  attempt_number       int  NOT NULL DEFAULT 1,
  phase_reached        int  NOT NULL,
  completion_status    text NOT NULL CHECK (completion_status IN ('completed','incomplete','expired')),
  badge_awarded        boolean NOT NULL DEFAULT false,
  started_at_offset    int  NOT NULL DEFAULT 0,   -- anchor; always 0
  completed_at_offset  int,                       -- seconds from session start
  created_at           timestamptz NOT NULL DEFAULT now()  -- wall-clock write time only
);
CREATE INDEX IF NOT EXISTS research_sessions_cohort ON research.sessions (cohort_id);

CREATE TABLE IF NOT EXISTS research.checkin_responses (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_session_id  uuid NOT NULL REFERENCES research.sessions(research_session_id) ON DELETE CASCADE,
  question_key         text NOT NULL,
  question_text        text NOT NULL,
  response_type        text NOT NULL CHECK (response_type IN ('likert','multiple_choice','short_text')),
  response             text NOT NULL
);
CREATE INDEX IF NOT EXISTS research_checkin_session ON research.checkin_responses (research_session_id);

CREATE TABLE IF NOT EXISTS research.transcripts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_session_id  uuid NOT NULL REFERENCES research.sessions(research_session_id) ON DELETE CASCADE,
  turn_number          int  NOT NULL,
  role                 text NOT NULL CHECK (role IN ('agent','student')),
  content              text NOT NULL,   -- de-identification filter applied before insert
  offset_seconds       int  NOT NULL    -- relative to session start, not wall clock
);
CREATE INDEX IF NOT EXISTS research_transcripts_session ON research.transcripts (research_session_id);

CREATE TABLE IF NOT EXISTS research.evaluations (
  research_session_id  uuid PRIMARY KEY REFERENCES research.sessions(research_session_id) ON DELETE CASCADE,
  dimension_ratings    jsonb NOT NULL,  -- [{dimensionName, rating, narrative}]
  outcome_summary      jsonb NOT NULL,  -- [{outcomeIndex, status}]
  overall_summary      text  NOT NULL,
  badge_awarded        boolean NOT NULL,
  assessed_at_offset   int   NOT NULL   -- seconds from session start
);

CREATE TABLE IF NOT EXISTS research.interaction_timing (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_session_id    uuid NOT NULL REFERENCES research.sessions(research_session_id) ON DELETE CASCADE,
  block_id               text NOT NULL,
  block_type             text NOT NULL CHECK (block_type IN ('conceptual','instructional','sap')),
  time_on_block_seconds  int  NOT NULL,
  step_sequence_observed int[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS research_timing_session ON research.interaction_timing (research_session_id);

-- down migration

DROP TABLE IF EXISTS research.interaction_timing;
DROP TABLE IF EXISTS research.evaluations;
DROP TABLE IF EXISTS research.transcripts;
DROP TABLE IF EXISTS research.checkin_responses;
DROP TABLE IF EXISTS research.sessions;
DROP SCHEMA IF EXISTS research;
