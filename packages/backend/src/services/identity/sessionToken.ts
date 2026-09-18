/**
 * sessionToken.ts
 *
 * Issues and verifies short-lived session JWTs (HS256).
 * The token carries only: sessionId, tempUserId, moduleId, currentPhase.
 * No student PII is encoded in the token.
 *
 * TODO: rotate JWT secret via Secrets Manager
 */
import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(process.env.SESSION_JWT_SECRET ?? 'dev-secret-change-me');
const TTL_H  = parseInt(process.env.SESSION_TTL_HOURS ?? '8', 10);

export interface SessionTokenPayload {
  sessionId:   string;
  tempUserId:  string;
  moduleId:    string;
  currentPhase: number;
}

export async function issueSessionToken(payload: SessionTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_H}h`)
    .sign(SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload> {
  const { payload } = await jwtVerify(token, SECRET);
  return payload as unknown as SessionTokenPayload;
}
