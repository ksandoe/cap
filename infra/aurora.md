# Aurora PostgreSQL Serverless v2

## Why Aurora over RDS
Aurora Serverless v2 scales to zero when idle (cost-effective for PoC and
early deployment) and scales automatically under class-sized concurrent load.
It is PostgreSQL-compatible so standard tooling (pg, node-pg-migrate) applies.

## Database: cap_prod (one database, two schemas)

### public schema — operational content
| Table              | Purpose                                              | Retention     |
|--------------------|------------------------------------------------------|---------------|
| recipes            | Instructional recipes + version history              | Permanent     |
| module_config      | Per-module settings (SAP doc types, badge ID, etc.)  | Permanent     |
| admin_users        | Admin App users (email, bcrypt hash, role)           | Permanent     |
| audit_log          | Operational events (no student PII)                  | 90 days       |
| validation_log     | Recipe notes from authors and instructors            | Permanent     |
| module_irb_config  | IRB approval status per module                       | Permanent     |

### research schema — de-identified research data
IRB approval required before populating. See Master PRD Section 5.4.

| Table                        | Purpose                                      |
|------------------------------|----------------------------------------------|
| research.sessions            | De-identified session records                |
| research.checkin_responses   | De-identified check-in responses             |
| research.transcripts         | De-identified conversation turns (filtered)  |
| research.evaluations         | De-identified evaluation results             |
| research.interaction_timing  | Content block timing data                    |

## Connection
- **Production**: AWS RDS Data API (no persistent connection — ideal for Lambda)
- **Local dev**: direct `pg` connection to local PostgreSQL
- **Secret**: `cap/prod/aurora-password` in Secrets Manager

## Key design decisions
- No student PII in Aurora. Canvas UUID is never written here.
- All research.* timestamps are relative offsets from session start.
- research.* records are linked by researchSessionId (not DynamoDB sessionId).
- The `research` schema must not be populated until module_irb_config.approved = true.
