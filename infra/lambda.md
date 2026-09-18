# AWS Lambda — Backend deployment

- **Runtime:** Node.js 20.x
- **Handler:** `dist/bundle.js` → `handler`
- **Memory:** 512 MB (increase if context compiler handles large docs)
- **Timeout:** 30 seconds (Anthropic API calls need headroom)
- **Environment variables:** loaded from Secrets Manager at cold start

## API Gateway routes
| Method | Path                          | Description              |
|--------|-------------------------------|--------------------------|
| GET    | /lti/oidc/login               | OIDC login initiation    |
| POST   | /lti/launch                   | LTI JWT receipt          |
| GET    | /.well-known/jwks.json        | Platform JWKS            |
| GET    | /health                       | Health check             |
| GET    | /session/{id}                 | Get session              |
| POST   | /session/{id}/checkin         | Submit check-in          |
| POST   | /session/{id}/verify-sap      | Initiate SAP verify      |
| GET    | /session/{id}/verify-status   | Poll verify status       |
| POST   | /session/{id}/complete        | Complete session         |
| POST   | /session/{id}/retry           | Create retry             |
| GET    | /recipe/{moduleId}            | Get active recipe        |
| POST   | /recipe                       | Save recipe              |
| POST   | /assessment/checkin-questions | Generate questions       |
| POST   | /assessment/turn              | Conversation turn        |
| POST   | /assessment/evaluate          | Generate evaluation      |
