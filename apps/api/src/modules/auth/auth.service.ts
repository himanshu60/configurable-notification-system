import bcrypt from 'bcryptjs';
import type { AuthResultDto, LoginInput, RegisterInput, UserDto } from '@cns/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../common/app-error.js';
import { UserModel, toUserDto, type UserDocument } from './user.model.js';
import { issueToken } from './token.service.js';

const buildAuthResult = (user: UserDocument): AuthResultDto => {
  const { token, expiresAt } = issueToken({
    sub: user.id as string,
    email: user.email,
    role: user.role,
  });

  return { token, expiresAt: expiresAt.toISOString(), user: toUserDto(user) };
};

export const register = async (input: RegisterInput): Promise<AuthResultDto> => {
  const existing = await UserModel.exists({ email: input.email });
  if (existing) {
    throw AppError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const user = await UserModel.create({
    name: input.name,
    email: input.email,
    passwordHash,
    role: 'USER',
  });

  return buildAuthResult(user);
};

export const login = async (input: LoginInput): Promise<AuthResultDto> => {
  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');

  // Same message and roughly the same work for both branches, so the response
  // does not reveal whether an account exists.
  if (!user) {
    await bcrypt.compare(input.password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    throw AppError.unauthorized('Email or password is incorrect');
  }

  const matches = await bcrypt.compare(input.password, user.passwordHash);
  if (!matches) {
    throw AppError.unauthorized('Email or password is incorrect');
  }

  return buildAuthResult(user);
};

export const getProfile = async (userId: string): Promise<UserDto> => {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw AppError.notFound('User');
  }
  return toUserDto(user);
};
