/**
 * sessionToken.ts
 *
 * Issues and verifies short-lived session JWTs (HS256).
 * The token carries only: sessionId, tempUserId, moduleId, currentPhase.
 * No student PII is encoded in the token.
 *
 * In production SESSION_JWT_SECRET can come from Secrets Manager instead of a plain
 * environment variable (config/secretsManager.ts, infra/secrets.md). Rotating it signs
 * everyone out; there is no automatic rotation.
 */
import { SignJWT, jwtVerify } from 'jose';
import { requireSecret } from '../../config/secrets';

// Read on use, not when the module loads, and never defaulted on a deployed function:
// config/secrets.ts refuses a missing or public-default secret there.
const secret = () => new TextEncoder().encode(requireSecret('SESSION_JWT_SECRET'));
const TTL_H  = parseInt(process.env.SESSION_TTL_HOURS ?? '8', 10);

export interface SessionTokenPayload {
  sessionId:   string;
  tempUserId:  string;
  moduleId:    string;
  currentPhase: number;
  canvasUuid?: string;   // IIO PRD §3.4 — used for resume/retry lookups
  role?:       'author' | 'instructor' | 'researcher' | 'admin'; // Admin App tokens only
}

export async function issueSessionToken(payload: SessionTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_H}h`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload> {
  const { payload } = await jwtVerify(token, secret());
  return payload as unknown as SessionTokenPayload;
}
