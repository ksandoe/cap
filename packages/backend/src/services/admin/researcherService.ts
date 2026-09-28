/**
 * researcherService.ts — Research data access (Aurora research.* schema).
 *
 * FERPA / IRB enforcement:
 *   1. Check IRB approval status for the requested moduleId before any query.
 *   2. Return 403 if approval is not confirmed.
 *   3. Never return direct student identifiers — query only research.* tables.
 *
 * All data is linked by researchSessionId (UUID, not tied to DynamoDB sessionId).
 * Timestamps are relative offsets, not wall-clock times.
 *
 * TODO: implement Aurora queries for each handler.
 */
import { Request, Response } from 'express';

async function checkIrbApproval(moduleId: string): Promise<boolean> {
  // TODO: query Aurora module_irb_config for approval status
  return false; // default: not approved
}

export async function queryResearch(req: Request, res: Response): Promise<void> {
  const { moduleId } = req.body;
  if (!await checkIrbApproval(moduleId)) {
    res.status(403).json({ error: { code: 'IRB_NOT_APPROVED',
      message: 'Research data collection is not approved for this module.' } });
    return;
  }
  // TODO: query research.sessions + joined tables with filters
  res.status(501).json({ error: 'Not implemented.' });
}

export async function exportResearch(req: Request, res: Response): Promise<void> {
  const { moduleId } = req.body;
  if (!await checkIrbApproval(moduleId)) {
    res.status(403).json({ error: { code: 'IRB_NOT_APPROVED',
      message: 'Research data collection is not approved for this module.' } });
    return;
  }
  // TODO: export linked CSV/JSON package. Log export to audit_log.
  res.status(501).json({ error: 'Not implemented.' });
}

export async function getConsentConfig(req: Request, res: Response): Promise<void> {
  // TODO: return IRB / consent configuration for moduleId
  res.status(501).json({ error: 'Not implemented.' });
}
