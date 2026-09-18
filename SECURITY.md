# Security policy

## Reporting a vulnerability

This project is developed under a research grant at Chico State. Please
report security issues privately to the maintainers rather than opening a
public issue.

## Secrets policy

- No credentials, API keys, client secrets, or private keys may appear in
  this repository — not in code, config, docs, tests, or fixtures.
- Local development uses `.env` (gitignored) with stub/simulated
  integrations. In deployment, all secrets live in AWS Secrets Manager
  under the `cap/<env>/` prefix and are fetched at runtime.
- If a secret is ever committed, treat it as compromised: rotate it
  immediately, then scrub history.

## Data minimization (FERPA posture)

The platform stores no student PII in persistent storage. Session records
are ephemeral (DynamoDB TTL) and destroyed on completion; anything that
must outlive a session is returned to the LMS. Session/session-token data
must never be written to browser storage (no localStorage/sessionStorage).

## Dependency hygiene

External integrations (SAP, Canvas/LTI, Credly, LLM) are isolated behind
`stub|live` switches in `packages/backend/src/config/env.ts` so each can
be validated and enabled independently.
