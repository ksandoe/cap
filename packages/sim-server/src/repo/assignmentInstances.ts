import { v4 as uuidv4 } from 'uuid';
import type { AssignmentInstance, Assignment } from '@sap-sim/shared';
import { resolveVariant, formatPoNumber } from '@sap-sim/engine';
import { db } from '../db';

interface Row {
  id: string;
  assignmentId: string;
  studentKey: string;
  source: string;
  variantIndex: number | null;
  seed: string | null;
  resolvedParamsJson: string;
  expectedNetValueJson: string;
  custPoNumber: string;
  createdAt: string;
}

function rowToInstance(row: Row): AssignmentInstance {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    studentKey: row.studentKey,
    source: row.source as AssignmentInstance['source'],
    variantIndex: row.variantIndex,
    seed: row.seed,
    resolvedParams: JSON.parse(row.resolvedParamsJson),
    expectedNetValue: JSON.parse(row.expectedNetValueJson),
    custPoNumber: row.custPoNumber,
    createdAt: row.createdAt,
  };
}

function nextPoNumber(assignmentId: string): string {
  // Simple per-assignment counter — §3c. Runs inside the caller's transaction so two concurrent
  // first-touches for the same assignment never get the same sequence number.
  const existing = db.prepare('SELECT nextSequence FROM po_counters WHERE assignmentId = ?').get(assignmentId) as
    | { nextSequence: number }
    | undefined;
  const sequence = existing ? existing.nextSequence : 1;
  db.prepare(
    `INSERT INTO po_counters (assignmentId, nextSequence) VALUES (?, ?)
     ON CONFLICT(assignmentId) DO UPDATE SET nextSequence = excluded.nextSequence`,
  ).run(assignmentId, sequence + 1);
  return formatPoNumber(sequence);
}

/**
 * Get this student's resolved variant for the assignment, creating it on first touch.
 * Never re-rolls an existing one — §3a's "resolve once, persist, never re-roll on resume".
 */
export function getOrCreateAssignmentInstance(assignment: Assignment, studentKey: string): AssignmentInstance {
  const existing = db
    .prepare('SELECT * FROM assignment_instances WHERE assignmentId = ? AND studentKey = ?')
    .get(assignment.id, studentKey) as Row | undefined;
  if (existing) return rowToInstance(existing);

  const create = db.transaction(() => {
    const resolved = resolveVariant(assignment, studentKey);
    const instance: AssignmentInstance = {
      id: uuidv4(),
      assignmentId: assignment.id,
      studentKey,
      source: resolved.source,
      variantIndex: resolved.variantIndex,
      seed: resolved.seed,
      resolvedParams: resolved.resolvedParams,
      expectedNetValue: resolved.expectedNetValue,
      custPoNumber: nextPoNumber(assignment.id),
      createdAt: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO assignment_instances
         (id, assignmentId, studentKey, source, variantIndex, seed, resolvedParamsJson, expectedNetValueJson, custPoNumber, createdAt)
       VALUES (@id, @assignmentId, @studentKey, @source, @variantIndex, @seed, @resolvedParamsJson, @expectedNetValueJson, @custPoNumber, @createdAt)`,
    ).run({
      ...instance,
      resolvedParamsJson: JSON.stringify(instance.resolvedParams),
      expectedNetValueJson: JSON.stringify(instance.expectedNetValue),
    });
    return instance;
  });

  return create();
}
