# Conversational Assessment Platform

Monorepo for the Conversational Assessment Platform (CAP). Two workspaces:

- `packages/frontend` — React SPA, deployed to AWS Amplify
- `packages/backend`  — Express.js API, deployed to AWS Lambda via API Gateway

## Quick start (local dev)

```bash
cp .env.example .env        # fill in local values
npm install
npm run dev
```

## Architecture overview

```
Canvas LMS
   │  LTI 1.3 launch
   ▼
API Gateway ──► Lambda (Express backend)
                    │
                    ├── Orchestrator          (routes student through phases)
                    ├── LTI Service           (launch validation, JWT)
                    ├── Identity Service      (tempuser lifecycle)
                    ├── SAP Connector         (pool mgmt, OData queries)
                    ├── Assessment Service    (Anthropic proxy, context compiler)
                    ├── Grade Service         (Canvas AGS grade return)
                    ├── Badge Service         (Credly issuance)
                    └── Event Logger          (audit log → DynamoDB)
                    │
                    ├── DynamoDB
                    │     ├── cap-sessions    (ephemeral, TTL-governed)
                    │     ├── cap-sap-pool    (SAP account pool + lock state)
                    │     └── cap-recipes     (instructional recipes)
                    └── Secrets Manager
                          (all API keys + credentials)
```

## Data principles

- No student PII is stored on the platform.
- Session data is ephemeral (DynamoDB TTL = session duration).
- All data that must outlive a session is returned to Canvas via AGS/LIS.
- The tempuser↔SAP mapping is destroyed on session exit.

## Packages

| Package | Description |
|---|---|
| `packages/frontend` | React + Vite SPA. Four-phase wizard UI. |
| `packages/backend`  | Express.js on Lambda. All business logic and external integrations. |
| `packages/shared`   | TypeScript types and constants shared across packages. |

## Environment

Copy `.env.example` to `.env` and fill in values for local development.
In AWS, all secrets are retrieved from Secrets Manager at runtime.
