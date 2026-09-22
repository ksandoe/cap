# AWS Lambda — Backend deployment

Single Lambda function serves both Student App and Admin App.

- **Runtime**: Node.js 20.x
- **Handler**: `dist/bundle.js` → `handler`
- **Memory**: 512 MB
- **Timeout**: 30 s (Anthropic API calls need headroom)
- **Environment variables**: loaded from Secrets Manager at cold start

## Route groups
| Group      | Auth             | Consumer       |
|------------|------------------|----------------|
| /lti/*     | Canvas JWT       | Student App    |
| /session/* | Student JWT      | Student App    |
| /assessment/* | Student JWT   | Student App    |
| /recipe/*  | Student or Admin JWT | Both apps  |
| /admin/*   | Admin JWT + role | Admin App      |

## Secrets required (Secrets Manager)
See infra/secrets.md. Added for two-app architecture:
- cap/prod/admin-jwt-secret  — HS256 secret for admin JWT signing
- cap/prod/aurora-password   — Aurora PostgreSQL password
