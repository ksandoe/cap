/**
 * learnerKey.ts
 *
 * Derives the opaque learner key from the LTI launch identity.
 *
 * Canvas identifies a learner by `sub`, which is unique only within an
 * issuer, so the key is computed over the (iss, sub) pair. It is a keyed
 * HMAC rather than the raw values: Canvas admins can map `sub` back to a
 * student, so the raw value must never reach the browser, the LLM, or
 * research records (docs/decisions/2026-10-canvas-lti-atec.md).
 *
 * The key is stable for as long as LEARNER_KEY_SECRET is unchanged —
 * rotating the secret breaks resume lookups and any research linkage
 * built on the key, so treat it as long-lived.
 *
 * TODO: load LEARNER_KEY_SECRET from Secrets Manager
 */
import { createHmac } from 'crypto';
import { requireSecret } from '../../config/secrets';

export function deriveLearnerKey(iss: string, sub: string): string {
  if (!iss || !sub) throw new Error('LTI launch is missing iss or sub');
  // Read on use, and never defaulted on a deployed function: a student's ID computed
  // from a public default could be recomputed by anyone who knows their Canvas ID.
  const secret = requireSecret('LEARNER_KEY_SECRET');
  // Newline separator: neither an issuer URL nor a sub can contain one,
  // so distinct (iss, sub) pairs can't collide by concatenation.
  const mac = createHmac('sha256', secret).update(`${iss}\n${sub}`).digest('hex');
  return `lk-${mac}`;
}
