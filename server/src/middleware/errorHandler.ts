/**
 * RFC 9457 (Problem Details for HTTP APIs) error responses.
 *
 * The global error handler converts unhandled errors into problem+json.
 * A legacy `error` field is included for backwards-compatibility with the
 * frontend apiClient, which reads `err.error`.
 */
import type { Request, Response, NextFunction } from 'express';
import { isDev } from '../config.js';

export function problemDetails(
  res: Response,
  status: number,
  title: string,
  detail: string,
  extra: Record<string, unknown> = {},
): void {
  res.status(status).type('application/problem+json').json({
    type: 'about:blank',
    title,
    status,
    detail,
    error: detail,
    ...extra,
  });
}

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('[Server] Unhandled error:', err);
  const status = err.status || err.statusCode || 500;
  const isServerError = status >= 500;
  problemDetails(
    res,
    status,
    isServerError ? 'Internal Server Error' : 'Request Failed',
    isDev() ? String(err.message || err) : (isServerError ? 'An unexpected error occurred.' : String(err.message || err)),
  );
}

/** Wrap a handler so thrown errors flow to the central handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
