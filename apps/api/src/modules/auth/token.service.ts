import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '@cns/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../common/app-error.js';

export interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

export const issueToken = (payload: TokenPayload): IssuedToken => {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: 'cns-api',
    audience: 'cns-web',
  };

  const token = jwt.sign(payload, env.JWT_SECRET, options);
  const { exp } = jwt.decode(token) as { exp: number };

  return { token, expiresAt: new Date(exp * 1000) };
};

export const verifyToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, env.JWT_SECRET, {
      issuer: 'cns-api',
      audience: 'cns-web',
    }) as TokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Your session has expired. Please sign in again.');
    }
    throw AppError.unauthorized('Invalid authentication token');
  }
};
