/**
 * session.ts — Shared session types.
 *
 * Sessions are ephemeral (DynamoDB, TTL-governed).
 * No student PII is stored persistently — the Canvas UUID is
 * held server-side only for resume lookup and is never returned
 * to the browser or written to Aurora.
 *
 * Session lifecycle (Master PRD Section 3.1):
 *   LAUNCHED → LEARNING → SAP_PENDING → SAP_VERIFIED →
 *   CHECKIN → CHECKOUT → EVALUATING → COMPLETED
 *   EXPIRED (TTL elapsed)
 *   RETRY (new session, linked to parent)
 */

export type SessionState =
  | 'LAUNCHED'
  | 'LEARNING'        // student working through content blocks
  | 'SAP_PENDING'     // SAP verification query in progress
  | 'SAP_VERIFIED'    // all required docs found; reflecting activity unlocked
  | 'CHECKIN'         // student completing check-in survey
  | 'CHECKOUT'        // student in AI conversation
  | 'EVALUATING'      // evaluation being generated
  | 'COMPLETED'       // grade posted, badge issued, session destroyed
  | 'RETRY'           // retry session (links to prior session)
  | 'EXPIRED';        // TTL elapsed without completing

export interface Session {
  // Identity
  sessionId:            string;     // PK — uuid
  tempUserId:           string;     // 'tempuser_<uuid>' — no PII
  moduleId:             string;
  recipeId:             string;
  recipeVersion:        number;

  // State
  state:                SessionState;
  phaseReached:         number;     // 1–4 (PHASES constant)
  attemptNumber:        number;
  priorSessionId?:      string;     // for retry sessions

  // LTI context (server-side only — never returned to browser)
  canvasUuid?:          string;     // resume lookup — server-side only, never sent to browser or Aurora
  ltiContextId:         string;
  ltiResourceLinkId:    string;
  agsEndpoint:          string;     // Canvas AGS lineitem URL for grade return
  lisResultSourcedId:   string;

  // SAP (server-side only)
  sapUsername?:         string;     // assigned from pool; never sent to browser
  sapVerifiedAt?:       string;
  sapDocRefs?:          string[];
  sapVerificationError?: { missingTypes?: string[]; error?: string };

  // Content block progress
  completedBlockIds:    string[];   // blockIds the student has completed

  // Reflecting activity
  checkinResponses?:    CheckinResponse[];
  transcript?:          { role: string; content: string }[];  // in-flight conversation
  evaluation?:          unknown;                               // in-flight evaluation result

  // Completion
  gradePostedAt?:       string;
  gradePostedScore?:    number;
  credlyAssertionId?:   string;
  badgeIssuedAt?:       string;
  startedAt:            string;
  completedAt?:         string;

  // DynamoDB TTL
  ttl:                  number;     // Unix epoch seconds
}

export interface CheckinResponse {
  questionKey:   string;
  questionText:  string;
  responseType:  'likert' | 'multiple_choice' | 'short_text';
  response:      string | number;
}
