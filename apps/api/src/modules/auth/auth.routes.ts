import { Router } from 'express';
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from '@cns/shared';
import { asyncHandler, created, ok } from '../../common/http.js';
import { validate, validated } from '../../middleware/validate.js';
import { authRateLimiter } from '../../middleware/rate-limit.js';
import { currentUser, requireAuth } from '../../middleware/require-auth.js';
import * as authService from './auth.service.js';

export const authRouter: Router = Router();

authRouter.post(
  '/register',
  authRateLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(validated<RegisterInput>(req));
    created(res, result);
  }),
);

authRouter.post(
  '/login',
  authRateLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(validated<LoginInput>(req));
    ok(res, result);
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    ok(res, await authService.getProfile(currentUser(req).id));
  }),
);
