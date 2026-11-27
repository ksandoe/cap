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
  | 'SAVED'           // student intentionally paused — account+state held ~1 week
  | 'INTERRUPTED'     // inactivity timeout — SAP account released back to pool
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

  // Per-student parameter values bound at launch from the module's parameter
  // table (keyed on sapUsername). Safe to expose to the browser — they are
  // this student's own assignment values rendered into instruction text.
  parameters?:          Record<string, string>;

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
  lastActivityAt?:      string;     // heartbeat — drives the interrupted sweep
  savedAt?:             string;     // set on explicit Save & exit

  // DynamoDB TTL
  ttl:                  number;     // Unix epoch seconds
}

export type CheckinTheme = 'past' | 'present' | 'future';

export interface CheckinResponse {
  questionKey:   string;
  questionText:  string;
  responseType:  'likert' | 'multiple_choice' | 'short_text';
  /** Check-in theme (v3.1): groups the profile for the debrief prompt. */
  theme?:        CheckinTheme;
  response:      string | number;
}

/** AI-generated check-in question (likert/multiple_choice carry options). */
export interface CheckinQuestion {
  questionKey:  string;
  questionText: string;
  responseType: 'likert' | 'multiple_choice' | 'short_text';
  /** Which check-in theme the question belongs to (past/present/future). */
  theme?:       CheckinTheme;
  options?:     string[];
}

/**
 * The LLM returns Likert/MC options in whichever shape it invents —
 * array of strings, array of numbers, or a {"1": "label"} object.
 * Normalize to string[] (radio values must be strings; a number option
 * stored as the answer later crashes .trim()). Integer-like object keys
 * enumerate numerically, so Object.values preserves label order.
 */
export function normalizeCheckinOptions(options: unknown): string[] | undefined {
  if (Array.isArray(options)) return options.map(String);
  // Object form — fall back to the key when a label is empty so mid-scale
  // options ({"3": ""}) don't render as blank radio buttons.
  if (options && typeof options === 'object')
    return Object.entries(options).map(([k, v]) => (v === '' || v == null ? k : String(v)));
  return undefined;
}

/** Limits for a module's fixed check-in questionnaire (Recipe.checkinQuestions). */
export const CHECKIN_LIMITS = {
  maxQuestions: 12,
  maxTextLength: 300,
  maxOptions: 8,
  maxOptionLength: 100,
} as const;

/**
 * Checks a fixed check-in questionnaire and returns a list of problems in plain
 * language (empty when it is valid). Used by the admin app before publishing and by
 * the server when a recipe is saved, so a malformed questionnaire never reaches
 * students.
 *
 * A question's key must stay the same when its wording is edited: answers are
 * recorded against the key.
 */
export function validateCheckinQuestions(input: unknown): string[] {
  if (!Array.isArray(input)) return ['The check-in questions must be a list.'];
  const problems: string[] = [];
  if (input.length > CHECKIN_LIMITS.maxQuestions)
    problems.push(`At most ${CHECKIN_LIMITS.maxQuestions} check-in questions are allowed.`);

  const seen = new Set<string>();
  input.forEach((raw, i) => {
    const n = `Question ${i + 1}`;
    const q = (raw ?? {}) as Record<string, unknown>;
    // The key is checked as given, not trimmed: a key with a stray space would pass a
    // trimmed check and then be stored, and answered against, with the space.
    const key = typeof q.questionKey === 'string' ? q.questionKey : '';
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(key)) problems.push(`${n}: needs a key of letters, numbers, - or _ (up to 60).`);
    else if (seen.has(key)) problems.push(`${n}: the key "${key}" is used twice.`);
    else seen.add(key);

    const text = typeof q.questionText === 'string' ? q.questionText.trim() : '';
    if (!text) problems.push(`${n}: needs question text.`);
    else if (text.length > CHECKIN_LIMITS.maxTextLength)
      problems.push(`${n}: the text is longer than ${CHECKIN_LIMITS.maxTextLength} characters.`);

    const type = q.responseType;
    if (type !== 'likert' && type !== 'multiple_choice' && type !== 'short_text') {
      problems.push(`${n}: the answer type must be likert, multiple_choice or short_text.`);
    } else if (type === 'short_text') {
      if (Array.isArray(q.options) && q.options.length) problems.push(`${n}: a short-text question has no options.`);
    } else {
      const opts = Array.isArray(q.options) ? q.options : [];
      if (opts.length < 2) problems.push(`${n}: needs at least 2 options.`);
      else if (opts.length > CHECKIN_LIMITS.maxOptions) problems.push(`${n}: at most ${CHECKIN_LIMITS.maxOptions} options.`);
      else if (opts.some(o => typeof o !== 'string' || !o.trim() || o.length > CHECKIN_LIMITS.maxOptionLength))
        problems.push(`${n}: every option needs text of up to ${CHECKIN_LIMITS.maxOptionLength} characters.`);
      else if (new Set(opts.map(o => String(o).trim())).size !== opts.length)
        problems.push(`${n}: two options are the same.`);
    }

    if (q.theme !== undefined && q.theme !== 'past' && q.theme !== 'present' && q.theme !== 'future')
      problems.push(`${n}: the theme must be past, present or future.`);
  });
  return problems;
}

/**
 * A copy of a validated questionnaire with surrounding spaces removed from the text and
 * the options, and with no undefined properties (the DynamoDB client rejects those).
 * Validation checks trimmed text, so store what was checked.
 */
export function cleanCheckinQuestions(questions: CheckinQuestion[]): CheckinQuestion[] {
  return questions.map(q => ({
    questionKey:  q.questionKey,
    questionText: q.questionText.trim(),
    responseType: q.responseType,
    ...(q.theme ? { theme: q.theme } : {}),
    ...(q.responseType !== 'short_text' && q.options ? { options: q.options.map(o => String(o).trim()) } : {}),
  }));
}
