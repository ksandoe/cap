/**
 * platformService.ts — Platform settings handlers (v3.1).
 *
 *   GET    /admin/platform          → current rubric + whether a custom
 *                                     passkey is set (never returns the key)
 *   PUT    /admin/platform/rubric   → replace the master rubric override
 *   DELETE /admin/platform/rubric   → revert to the MASTER_RUBRIC constant
 *   PUT    /admin/platform/passkey  → set a new shared passkey
 *   DELETE /admin/platform/passkey  → revert to ADMIN_PASSKEY env default
 *
 * All routes are admin-role only (mounted in routes/admin.ts).
 */
import { Request, Response } from 'express';
import { platformConfigDb }  from '../../db/platformConfigDb';
import { MASTER_RUBRIC }     from '@cap/shared';
import { logger }            from '../eventLogger';

export async function getPlatform(_req: Request, res: Response): Promise<void> {
  const cfg = await platformConfigDb.get();
  res.json({
    rubric:       cfg.rubric ?? MASTER_RUBRIC,
    rubricCustomized: !!cfg.rubric?.length,
    passkeySet:   !!cfg.passkey,
    updatedAt:    cfg.updatedAt,
    updatedBy:    cfg.updatedBy,
  });
}

export async function saveRubric(req: Request, res: Response): Promise<void> {
  const { rubric } = req.body ?? {};
  if (!Array.isArray(rubric) || rubric.length < 1) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'At least one rubric dimension is required.' } });
    return;
  }
  const cleaned = rubric.map((d: any) => ({
    name:        String(d?.name ?? '').trim(),
    description: String(d?.description ?? '').trim(),
  }));
  if (cleaned.some(d => !d.name || !d.description)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Every dimension needs a name and a description.' } });
    return;
  }
  const who = (req as any).session?.tempUserId;
  const cfg = await platformConfigDb.put({ rubric: cleaned }, who);
  logger.info('PLATFORM_RUBRIC_UPDATED', { dimensions: cleaned.length, updatedBy: who });
  res.json({ rubric: cfg.rubric });
}

export async function resetRubric(req: Request, res: Response): Promise<void> {
  const who = (req as any).session?.tempUserId;
  await platformConfigDb.put({ rubric: [] }, who);
  res.json({ rubric: MASTER_RUBRIC });
}

export async function savePasskey(req: Request, res: Response): Promise<void> {
  const { passkey } = req.body ?? {};
  if (typeof passkey !== 'string' || passkey.trim().length < 8) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Passkey must be at least 8 characters.' } });
    return;
  }
  const who = (req as any).session?.tempUserId;
  await platformConfigDb.put({ passkey: passkey.trim() }, who);
  logger.info('PLATFORM_PASSKEY_UPDATED', { updatedBy: who });
  res.json({ ok: true });
}

export async function resetPasskey(req: Request, res: Response): Promise<void> {
  const who = (req as any).session?.tempUserId;
  await platformConfigDb.put({ passkey: '' }, who);
  res.json({ ok: true });
}
