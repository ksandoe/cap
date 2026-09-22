/**
 * research.ts — De-identified research data types (Aurora research.* schema).
 *
 * FERPA / IRB: these types represent data that has been fully de-identified
 * before storage. No direct student identifiers are present.
 * All timestamps are relative offsets (seconds from session start),
 * not wall-clock times. Records are linked by researchSessionId only.
 *
 * The research.* tables in Aurora must not be populated until IRB
 * approval has been confirmed by a platform administrator.
 */

export interface ResearchSession {
  researchSessionId:  string;     // UUID — NOT linked to DynamoDB sessionId
  cohortId:           string;     // moduleId + academic period, e.g. 'SAP-SALES-2026-FALL'
  consentConfig:      string;     // IRB protocol identifier
  attemptNumber:      number;
  phaseReached:       number;
  completionStatus:   'completed' | 'incomplete' | 'expired';
  badgeAwarded:       boolean;
  startedAtOffset:    0;          // always 0 — anchor point
  completedAtOffset?: number;     // seconds from session start
  createdAt:          string;     // wall-clock write time (not student event time)
}

export interface ResearchCheckinResponse {
  researchSessionId:  string;
  questionKey:        string;
  questionText:       string;
  responseType:       'likert' | 'multiple_choice' | 'short_text';
  response:           string | number;
}

export interface ResearchTranscriptTurn {
  researchSessionId:  string;
  turnNumber:         number;
  role:               'agent' | 'student';
  content:            string;     // de-identified (PII filter applied)
  offsetSeconds:      number;     // seconds from session start
}

export interface ResearchEvaluation {
  researchSessionId:  string;
  dimensionRatings:   { dimensionName: string; rating: string; narrative: string }[];
  outcomeSummary:     { outcomeIndex: number; status: string }[];
  overallSummary:     string;
  badgeAwarded:       boolean;
  assessedAtOffset:   number;     // seconds from session start
}

export interface ResearchInteractionTiming {
  researchSessionId:  string;
  blockId:            string;
  blockType:          'conceptual' | 'instructional' | 'sap';
  timeOnBlockSeconds: number;
  stepSequenceObserved: number[]; // order in which steps were visited
}
