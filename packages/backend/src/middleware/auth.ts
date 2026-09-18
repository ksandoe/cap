import { Request, Response, NextFunction } from 'express';
import { verifySessionToken } from '../services/identity/sessionToken';

/**
 * Validates the session JWT on all protected routes.
 * Attaches decoded payload to req.session for downstream use.
 */
export async function authMiddleware(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Missing session token.' } });
    return;
  }
  try {
    const token = header.slice(7);
    req.session = await verifySessionToken(token);
    next();
  } catch {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Session token invalid or expired.' } });
  }
}
