# Conversational Assessment Platform (CAP)

Monorepo for the Conversational Assessment Platform.

## Packages

| Package               | Description                                              | Port |
|-----------------------|----------------------------------------------------------|------|
| `packages/shared`     | TypeScript types and constants shared across packages    | —    |
| `packages/backend`    | Express.js API on AWS Lambda. Serves both apps.          | 3001 |
| `packages/frontend-student` | Student App — LTI-launched wizard (learning + reflecting) | 3000 |
| `packages/frontend-admin`   | Admin App — authoring, instructor, researcher, admin tools | 3002 |

## Quick start (local dev)

```bash
cp .env.example .env      # local defaults already work out of the box
npm install
npm run dev               # starts all three on their respective ports
```

Then open http://localhost:3000 and click **Launch demo** — the dev landing
page simulates the Canvas LTI launch. The Admin App runs at
http://localhost:3002 — dev logins are seeded (`admin@cap.local` /
`dev-admin-password`; also `author@`, `instructor@`, `researcher@` variants).

Local dev runs against a JSON-file store (`USE_LOCAL_DB=true`, data in
`packages/backend/.dev-data/`) seeded with a demo recipe and SAP account
pool — no AWS required. SAP verification, Canvas grade return, and Credly
badge issuance are simulated. With no `OPENAI_API_KEY` set, the AI calls
return canned mock responses (`LLM_MODE=mock`); add a key to `.env` for the
real OpenAI-compatible API (Azure OpenAI supported — see `.env.example`).

Each external integration has an independent `stub|live` switch in `.env`
(`SAP_MODE`, `CANVAS_MODE`, `CREDLY_MODE`, `LLM_MODE`) so they can go live
independently as campus credentials arrive.

Or start individual apps:
```bash
npm run dev:student       # frontend-student + backend
npm run dev:admin         # frontend-admin + backend
```

## Database migrations (Aurora)

Schema migrations live in `packages/backend/migrations/` and run via
node-pg-migrate over a direct pg connection (the RDS Data API is used for
runtime queries in Lambda but does not support migration tooling):

```bash
# set AURORA_DATABASE_URL (or DATABASE_URL) in .env, then:
npm run migrate -w packages/backend -- up
```

`001_initial_schema.sql` creates the public schema tables;
`002_research_schema.sql` creates the IRB-gated `research.*` schema.

## Architecture

```
Canvas LMS (LTI 1.3)
      │
      ▼
API Gateway → Lambda (Express backend — packages/backend)
                  │
    ┌─────────────┼──────────────────────────────────────┐
    │             │                                      │
    ▼             ▼                                      ▼
  /lti/*      /session/*  /assessment/*  /recipe/*   /admin/*
  (public)    (student JWT)              (any JWT)   (admin JWT + role)
                  │                                      │
    Student App   │                           Admin App  │
    (Amplify)     │                           (Amplify)  │
    port 3000     │                           port 3002  │
                  │                                      │
    ┌─────────────┴──────────────────────────────────────┘
    │
    ├── DynamoDB
    │     ├── cap-sessions    (ephemeral, TTL — student sessions)
    │     └── cap-sap-pool    (SAP account pool)
    │
    ├── Aurora PostgreSQL (Serverless v2)
    │     ├── public schema   (recipes, module_config, audit_log, …)
    │     └── research schema (de-identified — IRB approval required)
    │
    ├── S3
    │     └── Background docs (recipe uploads)
    │
    └── Secrets Manager
          (all API keys and credentials)
```

## External integrations

| System       | Protocol              | Direction       | Purpose                        |
|--------------|-----------------------|-----------------|--------------------------------|
| Canvas LMS   | LTI 1.3 + AGS REST    | In + Out        | Launch, identity, grade return |
| SAP Sandbox  | OAuth 2.0 + OData     | Out (read-only) | Task verification              |
| Credly       | OAuth 2.0 REST        | Out             | Badge issuance                 |
| OpenAI       | REST (OpenAI-compat.) | Out             | AI questions, conversation, eval |

## Data principles (FERPA)

- **No student PII stored persistently.** Canvas UUID held server-side only.
- **Session records are ephemeral.** DynamoDB TTL + deletion on completion.
- **Research data is de-identified** before writing to Aurora research schema.
- **IRB approval required** before research schema is populated for any module.
- See `infra/aurora.md` for schema detail and `infra/secrets.md` for credential list.

## Key TODOs before first run

1. Register the Student App as an LTI 1.3 external tool in Canvas (see `infra/lambda.md`).
2. Populate `cap-sap-pool` DynamoDB table with SAP sandbox accounts.
3. Create Aurora database and run schema migrations (`npm run migrate -w packages/backend -- up`).
4. Load all secrets into Secrets Manager (see `infra/secrets.md`).
5. Confirm IRB approval before enabling the research schema.
