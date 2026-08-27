import { z } from 'zod';
import {
  DELIVERY_STATUSES,
  NOTIFICATION_CHANNELS,
  RECIPIENT_TYPES,
  type DeliveryStatus,
  type NotificationChannel,
  type RecipientType,
} from '../domain/enums.js';
import { objectIdSchema, paginationSchema, sortOrderSchema } from './common.schema.js';

export const deliveryQuerySchema = paginationSchema.extend({
  channel: z.enum(NOTIFICATION_CHANNELS).optional(),
  status: z.enum(DELIVERY_STATUSES).optional(),
  ruleId: objectIdSchema.optional(),
  recipient: z.string().trim().max(200).optional(),
  search: z.string().trim().max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortOrder: sortOrderSchema,
});

export const inboxQuerySchema = paginationSchema.extend({
  unreadOnly: z.enum(['true', 'false']).optional(),
});

export type DeliveryQuery = z.infer<typeof deliveryQuerySchema>;
export type InboxQuery = z.infer<typeof inboxQuerySchema>;

export interface DeliveryRecipientDto {
  type: RecipientType;
  value: string;
  userId?: string;
}

/**
 * One row of the notification history. The same document backs the outbox, the
 * history table and the in-app inbox — see ARCHITECTURE.md for why.
 */
export interface DeliveryDto {
  id: string;
  eventId: string;
  eventType: string;
  ruleId: string;
  ruleName: string;
  channel: NotificationChannel;
  recipient: DeliveryRecipientDto;
  subject: string;
  body: string;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt?: string;
  lastError?: string;
  providerMessageId?: string;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
}

export interface DeliveryStatsDto {
  totals: Record<DeliveryStatus, number>;
  byChannel: Array<{ channel: NotificationChannel; sent: number; failed: number; pending: number }>;
  rules: { total: number; enabled: number };
  events: { total: number; last24h: number };
  deliverySuccessRate: number;
}
