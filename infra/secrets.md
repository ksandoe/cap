# Secrets Manager — required secrets

> **Status: a plan, not the current state.** Nothing in the code loads from Secrets Manager yet (three source comments mark it as a TODO). Today these values are plain environment variables on the Lambda function, described in `lambda.md`. The names below are the intended Secrets Manager names and are partly out of date: for example, the model key is now an OpenAI-compatible `OPENAI_API_KEY`, not an Anthropic key. The one real use of Secrets Manager is the Aurora database secret that `AURORA_SECRET_ARN` points to (when Aurora is used). The first item to move should be the LTI private key for Canvas grade return.

All secrets stored under prefix: cap/<env>/

| Secret name                   | Description                                        |
|-------------------------------|----------------------------------------------------|
| cap/prod/anthropic-api-key    | Anthropic API key                                  |
| cap/prod/lti-private-key      | RSA private key (PEM) for LTI JWT signing          |
| cap/prod/canvas-client-id     | Canvas LTI 1.3 client ID                          |
| cap/prod/sap-client-secret    | SAP OAuth 2.0 client secret                       |
| cap/prod/credly-refresh-token | Credly OAuth 2.0 refresh token                    |
| cap/prod/session-jwt-secret   | HS256 secret for student session token signing     |
| cap/prod/admin-jwt-secret     | HS256 secret for admin JWT signing                 |
| cap/prod/aurora-password      | Aurora PostgreSQL password                         |
| cap/prod/admin-passkey        | Shared team passkey for Admin App sign-in (v3 interim; replaced by OTP) |
