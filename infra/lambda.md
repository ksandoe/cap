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
| Secrets Manager | `APP_SECRETS_ID`: the name or names (comma-separated) of the secrets to load (see below); unset means off |
| Mode switches | `USE_LOCAL_DB` (must be `false` here), `SAP_MODE`, `CANVAS_MODE`, `CREDLY_MODE`, `LLM_MODE`, `ENABLE_DEV_ROUTES`, `NODE_ENV`, `ALLOWED_ORIGINS` |
| DynamoDB tables | `DYNAMODB_TABLE_SESSIONS`, `_RECIPES`, `_RECIPE_DRAFTS`, `_SAP_POOL`, `_PARAMS`, `_MODULE_CONFIG`, `_EVALUATIONS`, `_ASSETS`, `_SIM_STATE` |
| Retention | `SIM_STATE_TTL_DAYS`, `SESSION_TTL_HOURS`, `SAVED_TTL_DAYS` |
| Canvas launch | `LTI_CLIENT_ID`, `LTI_REDIRECT_URI`, `LTI_OIDC_AUTH_URL`, `LTI_DEFAULT_ACTIVITY_ID`, `LTI_LANDING_PAGE`, `FRONTEND_URL`. `LTI_DEPLOYMENT_ID`, `LTI_PLATFORM_URL` and `LTI_PLATFORM_JWKS_URL` are set on the function but not read by the code yet (they are for launch verification, work package 6 task A1) |
| AI model | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_AUTH_STYLE`, `OPENAI_API_VERSION` |
| Aurora (only if used) | `AURORA_RESOURCE_ARN`, `AURORA_SECRET_ARN`, `AURORA_DATABASE`, `DATABASE_URL`. `AURORA_SECRET_ARN` points at a Secrets Manager secret, the one place Secrets Manager is used |

**The sensitive ones**: `OPENAI_API_KEY`, `LEARNER_KEY_SECRET`, `SESSION_JWT_SECRET`, `ADMIN_PASSKEY`, `SAP_CLIENT_SECRET` (and `DATABASE_URL` if it holds a password).
- `LEARNER_KEY_SECRET` derives each student's permanent ID. **Never change it once real students have launched**, or every student gets a new ID and loses their work.
- **Three of them have a public development default in the source** (and the passkey's is also in the README), used **only when running locally** (`USE_LOCAL_DB=true`). On a deployed function (`USE_LOCAL_DB` anything else) the code refuses a missing value or a value equal to the public default (`config/secrets.ts`, tested in `secrets.test.ts`):
  - `SESSION_JWT_SECRET` and `LEARNER_KEY_SECRET`: the function **refuses to start**, with an error in CloudWatch that names the variable (never a value). Before this check, a missing `SESSION_JWT_SECRET` meant every session token, admin ones included, was signed with a secret anyone could read.
  - `ADMIN_PASSKEY` (or a stored override set in the admin app): admin sign-in returns **503 "not set up"** until one exists. The public default passkey is never accepted.
  Each must be its own long random value (32 or more characters; shorter ones start with a warning). The check cannot tell a random value from a placeholder, so look at the values in the console too. **If you deploy this code to a function that lacks these, it stops working until you set them.** Set them first.
- `OPENAI_API_KEY` and `SAP_CLIENT_SECRET` have no default: missing, the calls that need them fail.

## Secrets Manager: built, off until `APP_SECRETS_ID` is set
The code can load the sensitive values from Secrets Manager at start-up (`config/secretsManager.ts`, `lambda/bootstrap.ts`). They are split into **two secrets by who may read them**: `cap/prod/app` (the runtime secrets) and `cap/lti-dev` (only the dev Canvas private key). **It does nothing until the function has the variable `APP_SECRETS_ID`** (the secrets' names, comma-separated, which are not themselves secret). Until then the sensitive values are plain environment variables, as the table above says.

Setup, the permission the function's role needs, how to move the values one at a time, and how to roll back are in `infra/secrets.md`. Rules in short:
- Only these names can come from a secret: `SESSION_JWT_SECRET`, `LEARNER_KEY_SECRET`, `ADMIN_PASSKEY`, `OPENAI_API_KEY`, `SAP_CLIENT_SECRET`, `DATABASE_URL`, `LTI_PRIVATE_KEY`. Anything else in one is ignored, so a secret can never switch on `USE_LOCAL_DB` or repoint a table.
- A name may be in only one secret; the same name in two is refused.
- A variable already set on the function wins over a secret. Move values one at a time, then delete the variable.
- If any secret cannot be read, nothing is applied and the function does not serve requests; it never falls back to a default.
- Only names are logged, never values. Settings that are not secrets (table names, modes, retention) stay environment variables.
