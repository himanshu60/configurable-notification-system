import type { RequestHandler } from 'express';
import type { UserRole } from '@cns/shared';
import { AppError } from '../common/app-error.js';
import { verifyToken } from '../modules/auth/token.service.js';

const BEARER = /^Bearer (.+)$/i;

/** Rejects the request unless it carries a valid `Authorization: Bearer` token. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  const match = header ? BEARER.exec(header) : null;

  if (!match?.[1]) {
    next(AppError.unauthorized('Missing authentication token'));
    return;
  }

  try {
    const payload = verifyToken(match[1]);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (error) {
    next(error);
  }
};

/** Must be mounted after `requireAuth`. */
export const requireRole =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };

/** Narrowed accessor for handlers mounted behind `requireAuth`. */
export const currentUser = (req: { user?: Express.AuthenticatedUser }): Express.AuthenticatedUser => {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  return req.user;
};
