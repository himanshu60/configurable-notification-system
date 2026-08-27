import { z } from 'zod';
import { USER_ROLES } from '../domain/enums.js';

export const emailSchema = z.email('Enter a valid email address').toLowerCase().trim();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: (typeof USER_ROLES)[number];
  createdAt: string;
}

export interface AuthResultDto {
  token: string;
  expiresAt: string;
  user: UserDto;
}
