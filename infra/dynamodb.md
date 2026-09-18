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
