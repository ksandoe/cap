# AWS Lambda — Backend deployment

Single Lambda function serves both Student App and Admin App.

- **Runtime**: Node.js 24.x (`nodejs24.x`, confirmed 2026-12). The bundle target in `packages/backend/package.json` and the Node version in `.github/workflows/ci.yml` match it; change all three together.
- **Handler**: `dist/bundle.js` → `handler`
- **Memory**: 512 MB
- **Timeout**: 30 s (Anthropic API calls need headroom)
- **Environment variables**: plain Lambda environment variables, set on the function itself (Configuration → Environment variables). The code reads them from `process.env`; nothing is loaded from Secrets Manager yet. See "Environment variables" below.

## Route groups
| Group      | Auth             | Consumer       |
|------------|------------------|----------------|
| /lti/*     | Canvas JWT       | Student App    |
| /session/* | Student JWT      | Student App    |
| /assessment/* | Student JWT   | Student App    |
| /recipe/*  | Student or Admin JWT | Both apps  |
| /admin/*   | Admin JWT + role | Admin App      |

## Environment variables

**How they are managed today.**
- They are plain settings on the function, edited in the console. A change applies to the next request; no redeploy.
- Deploying code (`update-function-code`, see `aws-setup.md` §3b) never touches them.
- `aws lambda update-function-configuration --environment ...` **replaces the whole set**. Never use it to change one value: it would delete every variable you left out. Use the console, or send the complete merged set.
- Anyone who can open the function in the console can read them. That is acceptable for the demo, and is why the sensitive ones (below) should move to Secrets Manager before real students use it.
- Values never go in the repository, in a pull request, in chat, or in a ticket. Only the names are written down.

**The names, from what the code reads** (`.env.example` shows an example of each; the list changes, so check the code with `grep -rhoE "process\.env\.[A-Z_0-9]+" packages/backend/src | sort -u`):

| Group | Variables |
|---|---|
| Mode switches | `USE_LOCAL_DB` (must be `false` here), `SAP_MODE`, `CANVAS_MODE`, `CREDLY_MODE`, `LLM_MODE`, `ENABLE_DEV_ROUTES`, `NODE_ENV`, `ALLOWED_ORIGINS` |
| DynamoDB tables | `DYNAMODB_TABLE_SESSIONS`, `_RECIPES`, `_RECIPE_DRAFTS`, `_SAP_POOL`, `_PARAMS`, `_MODULE_CONFIG`, `_EVALUATIONS`, `_ASSETS`, `_SIM_STATE` |
| Retention | `SIM_STATE_TTL_DAYS`, `SESSION_TTL_HOURS`, `SAVED_TTL_DAYS` |
| Canvas launch | `LTI_CLIENT_ID`, `LTI_REDIRECT_URI`, `LTI_OIDC_AUTH_URL`, `LTI_DEFAULT_ACTIVITY_ID`, `LTI_LANDING_PAGE`, `FRONTEND_URL`. `LTI_DEPLOYMENT_ID`, `LTI_PLATFORM_URL` and `LTI_PLATFORM_JWKS_URL` are set on the function but not read by the code yet (they are for launch verification, work package 6 task A1) |
| AI model | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_AUTH_STYLE`, `OPENAI_API_VERSION` |
| Aurora (only if used) | `AURORA_RESOURCE_ARN`, `AURORA_SECRET_ARN`, `AURORA_DATABASE`, `DATABASE_URL`. `AURORA_SECRET_ARN` points at a Secrets Manager secret, the one place Secrets Manager is used |

**The sensitive ones**: `OPENAI_API_KEY`, `LEARNER_KEY_SECRET`, `SESSION_JWT_SECRET`, `ADMIN_PASSKEY`, `SAP_CLIENT_SECRET` (and `DATABASE_URL` if it holds a password).
- `LEARNER_KEY_SECRET` derives each student's permanent ID. **Never change it once real students have launched**, or every student gets a new ID and loses their work.
- **Three of them have a built-in default that is public** (it is in the source, and the passkey's also in the README). If one is missing on a deployed function, the code silently uses the default instead of failing:
  - `SESSION_JWT_SECRET` missing: every session token, student and admin, is signed with a default anyone can read, so anyone could forge a token, including an admin one.
  - `ADMIN_PASSKEY` missing (and no stored override): the default passkey signs the holder in as admin.
  - `LEARNER_KEY_SECRET` missing: every student's permanent ID is computed from a public default.
  Each must be set to its own long random value, and **a value must not be one of the defaults or a placeholder**. Check the values in the console, not only that the names exist.
- `OPENAI_API_KEY` and `SAP_CLIENT_SECRET` have no default: missing, the calls that need them fail.

## Secrets Manager: planned, not in use
`infra/secrets.md` lists the secrets we intend to keep in Secrets Manager. Three comments in the source mark the same plan (`assessmentService.ts`, `learnerKey.ts`, `sessionToken.ts`: "TODO: load ... from Secrets Manager"). Until that is built, the table above is the real state. The first candidate is the tool's private key for Canvas grade return (work package 6, task B4), which should never be a plain environment variable.
