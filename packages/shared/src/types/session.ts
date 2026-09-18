export type SessionState =
  | 'LAUNCHED'
  | 'CHECKIN'
  | 'ACTIVITY'
  | 'SAP_PENDING'
  | 'SAP_VERIFIED'
  | 'CHECKOUT'
  | 'EVALUATING'
  | 'COMPLETED'
  | 'RETRY'
  | 'EXPIRED';

export interface Session {
  sessionId:          string;       // PK — uuid
  tempUserId:         string;       // 'tempuser_<uuid>' — no PII
  moduleId:           string;
  recipeId:           string;
  state:              SessionState;
  phaseReached:       number;
  attemptNumber:      number;
  priorSessionId?:    string;
  canvasUuid?:        string;       // server-side only — resume lookup, never sent to browser
  ltiContextId:       string;
  ltiResourceLinkId:  string;
  agsEndpoint:        string;       // Canvas AGS endpoint for grade return
  lisResultSourcedId: string;
  sapUsername?:       string;       // assigned from pool; server-side only
  sapVerifiedAt?:     string;
  sapDocRefs?:        string[];
  sapVerificationError?: { missingTypes?: string[]; error?: string };
  checkinResponses?:  CheckinResponse[];
  transcript?:        { role: string; content: string }[];
  gradePostedAt?:     string;
  gradePostedScore?:  number;
  credlyAssertionId?: string;
  badgeIssuedAt?:     string;
  startedAt:          string;
  completedAt?:       string;
  ttl:                number;       // Unix epoch — DynamoDB TTL attribute
}

export interface CheckinResponse {
  questionKey:  string;
  questionText: string;
  responseType: 'likert' | 'multiple_choice' | 'short_text';
  response:     string | number;
}
