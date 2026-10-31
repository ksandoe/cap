import { v4 as uuidv4 } from 'uuid';
import type { AppEvent, EventType } from '@sap-sim/shared';
import { db } from '../db';

const sessionStartByStudentAssignment = new Map<string, number>();

function sessionStartMs(studentKey: string, assignmentId: string): number {
  const key = `${studentKey}:${assignmentId}`;
  let start = sessionStartByStudentAssignment.get(key);
  if (start === undefined) {
    // Fall back to this student's earliest logged event, if any, so a server restart doesn't
    // reset everyone's relative clock to zero.
    const row = db
      .prepare('SELECT MIN(occurredAt) as first FROM events WHERE studentKey = ? AND assignmentId = ?')
      .get(studentKey, assignmentId) as { first: string | null };
    start = row.first ? new Date(row.first).getTime() : Date.now();
    sessionStartByStudentAssignment.set(key, start);
  }
  return start;
}

export function logEvent(input: {
  studentKey: string;
  assignmentId: string;
  docId?: string | null;
  type: EventType;
  payload?: Record<string, unknown>;
}): AppEvent {
  const occurredAt = new Date().toISOString();
  const event: AppEvent = {
    id: uuidv4(),
    studentKey: input.studentKey,
    assignmentId: input.assignmentId,
    docId: input.docId ?? null,
    type: input.type,
    payload: input.payload ?? {},
    occurredAt,
    relativeMs: new Date(occurredAt).getTime() - sessionStartMs(input.studentKey, input.assignmentId),
  };
  db.prepare(
    `INSERT INTO events (id, studentKey, assignmentId, docId, type, payloadJson, occurredAt, relativeMs)
     VALUES (@id, @studentKey, @assignmentId, @docId, @type, @payloadJson, @occurredAt, @relativeMs)`,
  ).run({ ...event, payloadJson: JSON.stringify(event.payload) });
  return event;
}
