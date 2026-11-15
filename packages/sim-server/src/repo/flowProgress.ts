import type { FlowProgress } from '@sap-sim/shared';
import { db } from '../db';

export function getFlowProgress(studentKey: string, assignmentId: string): FlowProgress {
  const row = db
    .prepare('SELECT * FROM flow_progress WHERE studentKey = ? AND assignmentId = ?')
    .get(studentKey, assignmentId) as FlowProgress | undefined;
  return row ?? { studentKey, assignmentId, currentBlockIndex: 0, furthestBlockIndex: 0 };
}

export function saveFlowProgress(progress: FlowProgress): FlowProgress {
  const current = getFlowProgress(progress.studentKey, progress.assignmentId);
  const merged: FlowProgress = {
    ...progress,
    furthestBlockIndex: Math.max(current.furthestBlockIndex, progress.furthestBlockIndex),
  };
  db.prepare(
    `INSERT INTO flow_progress (studentKey, assignmentId, currentBlockIndex, furthestBlockIndex)
     VALUES (@studentKey, @assignmentId, @currentBlockIndex, @furthestBlockIndex)
     ON CONFLICT(studentKey, assignmentId) DO UPDATE SET
       currentBlockIndex = excluded.currentBlockIndex,
       furthestBlockIndex = excluded.furthestBlockIndex`,
  ).run(merged);
  return merged;
}
