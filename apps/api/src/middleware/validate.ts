import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../common/app-error.js';

type Source = 'body' | 'query' | 'params';

/**
 * Parses one part of the request with a zod schema and replaces it with the
 * parsed result, so downstream handlers receive coerced, defaulted, typed data
 * instead of `unknown` strings. Failures become a 422 with per-field paths.
 */
export const validate =
  <T>(schema: ZodType<T>, source: Source = 'body'): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      next(
        AppError.badRequest(
          `Invalid request ${source}`,
          result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
      return;
    }

    // Express 5 exposes `req.query` through a getter, so assign via defineProperty.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };

/** Reads the value validated by `validate` with the right type attached. */
export const validated = <T>(req: Request, source: Source = 'body'): T => req[source] as T;
