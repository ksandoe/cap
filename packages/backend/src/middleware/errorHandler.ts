import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?:       string;
}

export function errorHandler(
  err: AppError, _req: Request, res: Response, _next: NextFunction
): void {
  const status = err.statusCode ?? 500;
  console.error(`[ERROR] ${err.code ?? 'UNKNOWN'}: ${err.message}`);
  res.status(status).json({
    error: { code: err.code ?? 'INTERNAL_ERROR', message: err.message },
  });
}
