import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import type { ApiErrorBody, FieldIssue } from '@cns/shared';
import { AppError, isAppError } from '../common/app-error.js';
import { logger } from '../common/logger.js';
import { env } from '../config/env.js';

const zodIssues = (error: ZodError): FieldIssue[] =>
  error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

/** Duplicate key errors carry the offending index in `keyPattern`. */
const duplicateKeyMessage = (error: mongoose.mongo.MongoServerError): string => {
  const field = Object.keys(error['keyPattern'] ?? {})[0];
  return field ? `A record with this ${field} already exists` : 'Record already exists';
};

const toAppError = (error: unknown): AppError => {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof ZodError) {
    return AppError.badRequest('The request failed validation', zodIssues(error));
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const details = Object.values(error.errors).map((issue) => ({
      path: issue.path,
      message: issue.message,
    }));
    return AppError.badRequest('The request failed validation', details);
  }

  if (error instanceof mongoose.Error.CastError) {
    return AppError.badRequest(`Invalid value for ${error.path}`);
  }

  if (
    error instanceof mongoose.mongo.MongoServerError &&
    (error.code === 11000 || error.code === 11001)
  ) {
    return AppError.conflict(duplicateKeyMessage(error));
  }

  return AppError.internal();
};

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.path}`));
};

/**
 * Single exit point for every failure. Unexpected errors are logged with their
 * stack but reported to the caller as a bare 500 so internals never leak.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError = toAppError(error);

  const logPayload = { err: error, requestId: req.id, code: appError.code };
  if (appError.status >= 500) {
    logger.error(logPayload, 'Unhandled request failure');
  } else {
    logger.warn(logPayload, appError.message);
  }

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
      requestId: req.id,
    },
  };

  if (!env.isProduction && appError.status >= 500 && error instanceof Error) {
    Object.assign(body.error, { stack: error.stack });
  }

  res.status(appError.status).json(body);
};
