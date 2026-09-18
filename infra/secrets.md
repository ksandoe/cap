# Secrets Manager — required secrets

All secrets stored under prefix: `cap/<env>/`

| Secret name                    | Description                                  |
|-------------------------------|----------------------------------------------|
| cap/prod/anthropic-api-key    | Anthropic API key                            |
| cap/prod/lti-private-key      | RSA private key (PEM) for LTI JWT signing    |
| cap/prod/canvas-client-id     | Canvas LTI 1.3 client ID                    |
| cap/prod/sap-client-secret    | SAP OAuth 2.0 client secret                 |
| cap/prod/credly-refresh-token | Credly OAuth 2.0 refresh token              |
| cap/prod/session-jwt-secret   | HS256 secret for session token signing       |
