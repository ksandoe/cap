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
  npx tsx scripts/seed-demo.ts

aws lambda update-function-configuration --function-name cap-demo-api \
  --environment "Variables={USE_LOCAL_DB=false,DYNAMODB_TABLE_SESSIONS=cap-sessions,DYNAMODB_TABLE_RECIPES=cap-recipes,DYNAMODB_TABLE_SAP_POOL=cap-sap-pool,AWS_REGION=us-east-1,LLM_MODE=openai,OPENAI_API_KEY=<key>,OPENAI_MODEL=gpt-4o-mini,SAP_MODE=stub,CANVAS_MODE=stub,CREDLY_MODE=stub,ENABLE_DEV_ROUTES=true,FRONTEND_URL=https://gtdqd19poa.execute-api.us-east-1.amazonaws.com,SESSION_JWT_SECRET=<secret>,SESSION_TTL_HOURS=24}"
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
