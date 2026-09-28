/**
 * asyncRouter.ts — Router factory that forwards async rejections to the
 * error-handling middleware.
 *
 * Express 4 does not catch rejected promises from async route handlers —
 * an uncaught rejection means no response is ever sent, which surfaces to
 * API Gateway clients as a bare {"message":"Internal Server Error"} instead
 * of our JSON error shape. This wraps every handler registered on the
 * router (including `use` middleware) so rejections reach errorHandler.
 */
import { Router, RequestHandler } from 'express';

const METHODS = ['use', 'get', 'post', 'put', 'patch', 'delete', 'all'] as const;

export function asyncRouter(): Router {
  const router = Router();
  const wrap = (h: RequestHandler): RequestHandler => (req, res, next) => {
    Promise.resolve(h(req, res, next)).catch(next);
  };
  for (const m of METHODS) {
    const orig = (router as any)[m].bind(router);
    (router as any)[m] = (...args: any[]) =>
      orig(...args.map(a => (typeof a === 'function' ? wrap(a) : a)));
  }
  return router;
}
