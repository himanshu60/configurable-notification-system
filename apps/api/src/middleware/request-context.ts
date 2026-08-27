import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from '../common/logger.js';

const SILENT_PATHS = new Set(['/health', '/health/ready']);

/**
 * Accepts a caller supplied `x-request-id` so a trace can span the client, the
 * API and the worker; mints one otherwise. Always echoed back on the response.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.id = incoming && incoming.length <= 200 ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};

/**
 * One structured line per completed request. Written by hand rather than pulled
 * from pino-http so the request id stays a plain string and health checks stay
 * out of the log.
 */
export const httpLogger: RequestHandler = (req, res, next) => {
  if (SILENT_PATHS.has(req.path)) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const payload = {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      userId: req.user?.id,
    };

    if (res.statusCode >= 500) {
      logger.error(payload, 'request failed');
    } else if (res.statusCode >= 400) {
      logger.warn(payload, 'request rejected');
    } else {
      logger.info(payload, 'request completed');
    }
  });

  next();
};
