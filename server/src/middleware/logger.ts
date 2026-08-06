/**
 * Lightweight request logger middleware.
 *
 * - Production: quiet JSON (structured logging for GCP collector)
 * - Dev: colored ANSI output
 */
import { Request, Response, NextFunction } from 'express';
import { isProduction } from '../config.js';

// ANSI escape codes for colors
const C = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  white: '\x1b[37m',
} as const;

function color(str: string, code: string): string {
  return isProduction() ? str : `${code}${str}${C.reset}`;
}

function formatDuration(ms: number): string {
  if (ms < 10) return `${ms}ms`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function log(level: string, message: string) {
  if (isProduction()) {
    console.log(JSON.stringify({ level, message }));
  } else {
    const ts = new Date().toISOString();
    const tsColor = color(ts, C.gray);
    const levelStr = color(`[${level.toUpperCase()}]`, level === 'error' ? C.red : level === 'warn' ? C.yellow : C.green);
    console.log(`  ${tsColor} ${levelStr} ${message}`);
  }
}

/**
 * Express middleware that logs each request.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  // Sanitize a client-supplied request id: strip CR/LF so a hostile header
  // cannot smuggle response-header lines or log lines (header injection).
  const rawRequestId = (req.headers as any)['x-request-id'];
  const requestId = (typeof rawRequestId === 'string' && /^[A-Za-z0-9\-_:.]+$/.test(rawRequestId))
    ? rawRequestId
    : crypto.randomUUID();
  (req.headers as any)['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, url } = req;
    const uid = (req as any).user?.uid || 'anonymous';
    const rId = (req.headers as any)['x-request-id'];

    const statusColor = res.statusCode >= 500 ? C.red :
                        res.statusCode >= 400 ? C.yellow :
                        res.statusCode >= 300 ? C.cyan :
                        C.green;

    const statusStr = color(`${res.statusCode}`, statusColor);
    const durStr = color(formatDuration(duration), C.gray);
    const message = `${method} ${url} ${statusStr} ${durStr} uid=${uid} req=${rId}`;

    if (res.statusCode >= 500) {
      log('error', message);
    } else if (res.statusCode >= 400) {
      log('warn', message);
    } else {
      log('info', message);
    }
  });
}

/**
 * Simple log helper function.
 */
export function logEvent(level: string, message: string, meta: Record<string, unknown> = {}) {
  const extra = Object.entries(meta).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
  const fullMessage = extra ? `${message} ${extra}` : message;
  log(level, fullMessage);
}

export default requestLogger;
