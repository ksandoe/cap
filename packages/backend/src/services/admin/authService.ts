/**
 * authService.ts — Admin App authentication.
 *
 * v3 interim: a single shared team passkey (ADMIN_PASSKEY env var) grants
 * full admin access. Colleagues type the passkey plus an optional name for
 * audit attribution; the issued JWT carries role 'admin', which satisfies
 * every existing requireRole gate.
 *
 * Long-term design (deferred): OTP sign-on — email → one-time code → JWT —
 * with per-user accounts in the Aurora admin_users table and role-based
 * auth (author | instructor | researcher | admin) managed by a superadmin.
 * The role claim, requireRole middleware, and admin_users schema already
 * support that model; this handler is the only piece that changes.
 */
import { Request, Response } from 'express';
import { issueSessionToken }   from '../identity/sessionToken';
import { platformConfigDb }    from '../../db/platformConfigDb';

export async function handleAdminLogin(req: Request, res: Response): Promise<void> {
  const { passkey, name } = req.body ?? {};
  if (!passkey || typeof passkey !== 'string') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'passkey required.' } });
    return;
  }

  // Stored override (set via Admin → Platform settings) wins over the env
  // var; the env var is the bootstrap/default.
  const expected = await platformConfigDb.passkey();
  if (passkey !== expected) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect passkey.' } });
    return;
  }

  const who = typeof name === 'string' && name.trim() ? name.trim() : 'team';
  const token = await issueSessionToken({
    sessionId:    `admin_${who}`,
    tempUserId:   who,
    moduleId:     '',
    currentPhase: 0,
    role:         'admin',
  });

  res.json({ token, role: 'admin', name: who });
}
