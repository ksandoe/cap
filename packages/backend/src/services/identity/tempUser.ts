/**
 * tempUser.ts
 *
 * Manages the ephemeral tempUser identity for each session.
 * A tempUser is a non-identifying UUID-based handle that exists only
 * for the duration of a session. No mapping to a real student is stored
 * on the platform.
 *
 * The tempUser↔SAP mapping is stored in DynamoDB for session duration
 * only and destroyed when the session exits (completes, expires, or errors).
 */
import { v4 as uuidv4 } from 'uuid';

export function generateTempUserId(): string {
  return `tempuser_${uuidv4()}`;
}
