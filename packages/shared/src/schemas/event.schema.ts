import { z } from 'zod';
import { EVENT_STATUSES, type EventStatus } from '../domain/enums.js';
import { paginationSchema, sortOrderSchema } from './common.schema.js';

/**
 * `eventId` is the idempotency key. Producers that cannot generate one may omit
 * it and the API will mint a UUID, but at-least-once producers should always
 * send a stable id so a redelivery is recognised as a duplicate.
 */
export const ingestEventSchema = z.object({
  eventId: z.string().trim().min(6, 'Event id must be at least 6 characters').max(200).optional(),
  type: z.string().trim().min(1, 'Event type is required').max(120),
  payload: z.record(z.string(), z.unknown()),
  source: z.string().trim().max(80).default('api'),
  occurredAt: z.coerce.date().optional(),
});

export const eventQuerySchema = paginationSchema.extend({
  type: z.string().trim().optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  search: z.string().trim().max(200).optional(),
  sortOrder: sortOrderSchema,
});

export type IngestEventInput = z.infer<typeof ingestEventSchema>;
export type EventQuery = z.infer<typeof eventQuerySchema>;

export interface EventDto {
  id: string;
  eventId: string;
  type: string;
  source: string;
  status: EventStatus;
  payload: Record<string, unknown>;
  matchedRuleIds: string[];
  deliveryCount: number;
  suppressedCount: number;
  error?: string;
  occurredAt: string;
  receivedAt: string;
  processedAt?: string;
}

/** Response of `POST /events`. */
export interface IngestEventResultDto {
  event: EventDto;
  /** True when this exact `eventId` had already been accepted before. */
  duplicate: boolean;
  matchedRules: Array<{ id: string; name: string }>;
  deliveriesCreated: number;
  deliveriesSuppressed: number;
}
