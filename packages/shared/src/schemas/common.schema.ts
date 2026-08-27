import { z } from 'zod';

/** 24 character hex string produced by MongoDB. */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid 24 character id');

/** Coerces `?page=2` style query strings into numbers before validating. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

/** `?enabled=true` arrives as a string; treat the absent case as "no filter". */
export const booleanQuerySchema = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((value) => value === true || value === 'true');

export const isoDateSchema = z.iso.datetime({ offset: true }).or(z.iso.date());
