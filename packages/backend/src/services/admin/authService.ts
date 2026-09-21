/**
 * authService.ts — Admin App authentication.
 *
 * In local dev (USE_LOCAL_DB): email + password validated against the
 * seeded admin_users in localStore (admin@cap.local / dev-admin-password,
 * plus author@, instructor@, researcher@ variants).
 *
 * In production: look up admin_users in Aurora and verify a bcrypt hash —
 * or replace this flow entirely with SAML/OIDC to the institutional IdP
 * (open question #6 in the Master PRD).
 *
 * TODO: implement bcrypt hash verification against Aurora admin_users
 * TODO: implement institutional SSO flow
 */
import { Request, Response } from 'express';
import { issueSessionToken }   from '../identity/sessionToken';
import { USE_LOCAL_DB }        from '../../config/env';
import { findAdminUser }       from '../../db/localStore';
import { auroraConfigured, query } from '../../db/auroraDb';

type AdminRole = 'author' | 'instructor' | 'researcher' | 'admin';

export async function handleAdminLogin(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'email and password required.' } });
    return;
  }

  let role: AdminRole | null = null;

  if (USE_LOCAL_DB) {
    const user = findAdminUser(email);
    // Dev store holds plaintext passwords — local only, never in production
    if (user && user.password === password) role = user.role as AdminRole;
  } else if (auroraConfigured()) {
    // TODO: verify bcrypt hash — dev seeds use plaintext; Aurora must store hashes
    const r = await query<{ role: AdminRole }>(
      'SELECT role FROM admin_users WHERE email = $1 AND hashed_password = $2',
      [email, password],
    );
    role = r.rows[0]?.role ?? null;
  }

  if (!role) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
    return;
  }

  const token = await issueSessionToken({
    sessionId:    `admin_${email}`,
    tempUserId:   email,
    moduleId:     '',
    currentPhase: 0,
    role,
  });

  res.json({ token, role, email });
}
