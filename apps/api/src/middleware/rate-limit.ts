import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { ApiErrorBody } from '@cns/shared';
import { env } from '../config/env.js';

const rateLimitBody = (requestId: string): ApiErrorBody => ({
  error: {
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please slow down and try again shortly.',
    requestId,
  },
});

/** Baseline limit applied to the whole API surface. */
export const apiRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Tests fire hundreds of requests in a few milliseconds; limiting them there
  // would make the suite flaky rather than safer.
  skip: () => env.isTest,
  handler: (req, res) => res.status(429).json(rateLimitBody(req.id)),
});

/**
 * Credential endpoints get a much tighter budget than the rest of the API to
 * blunt password spraying.
 */
export const authRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => env.isTest,
  handler: (req, res) => res.status(429).json(rateLimitBody(req.id)),
});
