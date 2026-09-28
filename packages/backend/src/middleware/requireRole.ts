/**
 * requireRole.ts — Role-based access control middleware for admin routes.
 *
 * Checks the 'role' claim in the decoded JWT payload (set by authMiddleware).
 * The student app uses 'session' tokens (no role field).
 * The admin app uses 'admin' tokens with a role claim.
 */
import { Request, Response, NextFunction } from 'express';

type AdminRole = 'author' | 'instructor' | 'researcher' | 'admin';

export function requireRole(allowed: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req.session as any)?.role as AdminRole | undefined;
    if (!role || !allowed.includes(role)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient role.' } });
      return;
    }
    next();
  };
}
