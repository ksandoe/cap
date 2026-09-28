# CAP Demo — AWS Setup Checklist

Durable-store migration for the deployed demo (`cap-demo-api` Lambda +
`gtdqd19poa` HTTP API). Everything below is scoped to `cap-*` resources;
the IAM policy for a deploy user is in `cap-deploy-policy.json`.

## 1. DynamoDB tables (durable sessions, recipes, SAP pool)

```bash
aws dynamodb create-table --table-name cap-sessions \
  --attribute-definitions AttributeName=sessionId,AttributeType=S \
                          AttributeName=canvasUuid,AttributeType=S \
                          AttributeName=moduleId,AttributeType=S \
  --key-schema AttributeName=sessionId,KeyType=HASH \
  --global-secondary-indexes 'IndexName=canvasUuid-moduleId-index,KeySchema=[{AttributeName=canvasUuid,KeyType=HASH},{AttributeName=moduleId,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
  --billing-mode PAY_PER_REQUEST

aws dynamodb update-time-to-live --table-name cap-sessions \
  --time-to-live-specification Enabled=true,AttributeName=ttl

aws dynamodb create-table --table-name cap-recipes \
  --attribute-definitions AttributeName=moduleId,AttributeType=S \
                          AttributeName=version,AttributeType=N \
  --key-schema AttributeName=moduleId,KeyType=HASH AttributeName=version,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

aws dynamodb create-table --table-name cap-sap-pool \
  --attribute-definitions AttributeName=sapUsername,AttributeType=S \
  --key-schema AttributeName=sapUsername,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Per-account parameter values for guided-tool {key} placeholders.
# Item shape: { moduleId, sapUsername, values: { key: value } }
aws dynamodb create-table --table-name cap-params \
  --attribute-definitions AttributeName=moduleId,AttributeType=S \
                          AttributeName=sapUsername,AttributeType=S \
  --key-schema AttributeName=moduleId,KeyType=HASH AttributeName=sapUsername,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

# Per-module passing thresholds (instructor-tunable).
# Item shape: { moduleId, overallMin, dimensionFloor, updatedAt, updatedBy }
aws dynamodb create-table --table-name cap-module-config \
  --attribute-definitions AttributeName=moduleId,AttributeType=S \
  --key-schema AttributeName=moduleId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# De-identified evaluation records for research + threshold tuning.
# Item shape: { attemptId, moduleId, recipeVersion, attemptNumber,
#               evaluation, transcript, completedAt }
aws dynamodb create-table --table-name cap-evaluations \
  --attribute-definitions AttributeName=attemptId,AttributeType=S \
  --key-schema AttributeName=attemptId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Recipe image assets (screenshots embedded in rich text / instructions).
# Item shape: { assetId, moduleId?, contentType, data(base64), createdAt }
# Images are stored base64 and served via GET /assets/:id — keeps local dev
# identical to prod; the admin client downscales to ~280KB before upload.
aws dynamodb create-table --table-name cap-assets \
  --attribute-definitions AttributeName=assetId,AttributeType=S \
  --key-schema AttributeName=assetId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

## 2. Lambda role permissions

Attach to role `cap-demo-lambda-role` (or the cap-deploy policy covers
creating the inline policy):

- `dynamodb:GetItem|PutItem|UpdateItem|DeleteItem|Query|Scan` on
  `arn:aws:dynamodb:us-east-1:501517924477:table/cap-*`
- For Aurora Data API (optional, see §4): `rds-data:ExecuteStatement` on the
  cluster + `secretsmanager:GetSecretValue` on the DB secret

## 3. Seed + flip

```bash
cd packages/backend
DYNAMODB_TABLE_RECIPES=cap-recipes DYNAMODB_TABLE_SAP_POOL=cap-sap-pool \
DYNAMODB_TABLE_PARAMS=cap-params \
  npx tsx scripts/seed-demo.ts

aws lambda update-function-configuration --function-name cap-demo-api \
  --environment "Variables={USE_LOCAL_DB=false,DYNAMODB_TABLE_SESSIONS=cap-sessions,DYNAMODB_TABLE_RECIPES=cap-recipes,DYNAMODB_TABLE_SAP_POOL=cap-sap-pool,DYNAMODB_TABLE_PARAMS=cap-params,DYNAMODB_TABLE_MODULE_CONFIG=cap-module-config,DYNAMODB_TABLE_EVALUATIONS=cap-evaluations,DYNAMODB_TABLE_ASSETS=cap-assets,AWS_REGION=us-east-1,LLM_MODE=openai,OPENAI_API_KEY=<key>,OPENAI_MODEL=gpt-4o-mini,SAP_MODE=stub,CANVAS_MODE=stub,CREDLY_MODE=stub,ENABLE_DEV_ROUTES=true,FRONTEND_URL=https://gtdqd19poa.execute-api.us-east-1.amazonaws.com,SESSION_JWT_SECRET=<secret>,SESSION_TTL_HOURS=24,SAVED_TTL_DAYS=7}"
```

## 4. Aurora Data API (durable recipes/config — optional for the demo)

Aurora holds authored recipes, module config, audit log — the persistent,
non-PII store. Sessions stay in DynamoDB by design (FERPA: no identifying
session data in Aurora).

1. Console → RDS → cluster `database-1` → Modify → enable **Data API**
   (or `rds:ModifyDBCluster` with `EnableHttpEndpoint=true`)
2. Secrets Manager → create secret `cap/aurora-credentials`
   (`{"username": "...", "password": "..."}`)
3. Lambda env: `AURORA_CLUSTER_ARN`, `AURORA_SECRET_ARN`,
   `AURORA_DB_NAME` — `auroraDb.ts` activates automatically

Note: VPC attachment is the alternative path, but it breaks outbound
calls to OpenAI unless a NAT gateway exists — Data API avoids that.
