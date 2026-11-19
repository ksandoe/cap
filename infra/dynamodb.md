# DynamoDB Tables

## cap-sessions
- **Purpose:** Ephemeral session state. All records have a TTL attribute.
- **PK:** `sessionId` (String)
- **TTL attribute:** `ttl` (Unix epoch seconds)
- **GSI:** `canvasUuid-moduleId-index` — PK: `canvasUuid`, SK: `moduleId`
  - Used for session resume lookup
- **Access patterns:**
  - Get session by sessionId
  - Find active session by canvasUuid + moduleId (resume)
  - Update session state/phase
  - Delete session on completion

## cap-sap-pool
- **Purpose:** SAP account pool. Records are permanent (no TTL).
- **PK:** `sapUsername` (String)
- **GSI:** `status-index` — PK: `status`
  - Used to find available accounts
- **Attributes:** status, assignedSessionId, assignedAt
- **Access patterns:**
  - Scan/query available accounts
  - Conditional update to claim account (status: available → in_use)
  - Update to release account (status: in_use → available)

## cap-recipes
- **Purpose:** Instructional recipes (authored content). Permanent, no TTL.
- **PK:** `moduleId` (String), **SK:** `version` (Number)
- **GSI:** `isActive-index`
- **Access patterns:**
  - Get active recipe by moduleId
  - List all versions by moduleId
  - Put new recipe version

## cap-recipe-drafts (v3)
- **Purpose:** Server-side authoring drafts — works in progress for the
  wizard, including extracted source-material text, clarifying answers,
  AI-generated fields, and per-section completion state. Permanent (no
  TTL); deleted on publish or explicit discard.
- **PK:** `draftId` (String)
- **Access patterns:**
  - List all drafts (workspace "drafts in progress" zone)
  - Get/update draft by draftId (autosave + resume across sessions)
  - Create draft (blank, AI-generated, or seeded from a published recipe)
  - Delete draft on publish or discard
- **Note:** `sourceMaterials` holds extracted plain text only — the
  uploaded file bytes are never persisted.

## cap-sim-state (work package 1)
- **Purpose:** SAP-simulator state — one learner's assignment instance,
  sales documents, and event log for one activity. Keyed by
  `SimScope { learnerKey, activityId }`, NOT by session: sessions are
  deleted at completion, but students revisit their documents, so sim
  state expires on its own timer (`SIM_STATE_TTL_DAYS`, provisional
  default 120 ≈ one semester; pending David's confirmation). Document
  `createdAt` timestamps are stored for the Document Flow view but are
  never exported to research or evaluation records.
- **PK:** `pk` (String) = `learnerKey` — the opaque HMAC learner key
  (`canvasUuid` on the session record). Never leaves the server.
- **SK:** `sk` (String) = `<activityId>#<entity>`:
  - `<activityId>#INSTANCE` — the resolved `AssignmentInstance`, including
    server-only fields (`seed`, `expectedNetValue`). Routes must only ever
    return the `PublicAssignmentInstance` projection.
  - `<activityId>#DOC#<docId>` — a `SalesDocument` (id like `INQ-000001`,
    unique within the scope).
  - `<activityId>#EVT#<seq>` — an event with internal `occurredAt` and
    relative `relativeMs`; events are write-only today (Stage 3 consumes
    them later).
  - `<activityId>#CTR#<name>` — per-scope counters (document number
    sequences per doc type, event sequence).
- **TTL attribute:** `ttl` (Unix epoch seconds), on every item in a scope.
- **Access patterns:**
  - All access is `pk = learnerKey AND begins_with(sk, <activityId>#…)` —
    one learner cannot reach another's documents, including searches by
    customer reference.
  - Get instance; list/get documents; find documents by docType +
    custReference; walk predecessorId for document flow.
  - Append event; purge a whole scope (retention / semester cleanup).
- **Console setup (Kent):** table `cap-sim-state`, partition key `pk`
  (String), sort key `sk` (String), TTL attribute `ttl`, default
  on-demand billing. Backend env var `DYNAMODB_TABLE_SIM_STATE`.
