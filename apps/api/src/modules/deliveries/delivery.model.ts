import { Schema, type Types, model, type HydratedDocument, type Model } from 'mongoose';
import {
  DELIVERY_STATUSES,
  NOTIFICATION_CHANNELS,
  RECIPIENT_TYPES,
  type DeliveryDto,
  type DeliveryStatus,
  type NotificationChannel,
  type RecipientType,
} from '@cns/shared';

export interface DeliveryAttributes {
  /** Producer supplied event id, not the `events` document id. */
  eventId: string;
  eventType: string;
  ruleId: Types.ObjectId;
  /** Denormalised so history stays readable after a rule is renamed or deleted. */
  ruleName: string;
  ownerId: Types.ObjectId;
  channel: NotificationChannel;
  recipient: { type: RecipientType; value: string; userId?: Types.ObjectId | null };
  subject: string;
  body: string;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt?: Date | null;
  lastError?: string | null;
  providerMessageId?: string | null;
  sentAt?: Date | null;
  /** Set while a worker holds the row; cleared on every terminal transition. */
  lockedAt?: Date | null;
  lockedBy?: string | null;
  /**
   * Deterministic fingerprint of (rule, channel, recipient, event or time
   * bucket). The unique index below is what actually prevents duplicate
   * notifications - see `engine/dedupe.ts`.
   */
  dedupeKey: string;
  /** In-app only: when the recipient opened it. */
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const deliverySchema = new Schema<DeliveryAttributes>(
  {
    eventId: { type: String, required: true, index: true },
    eventType: { type: String, required: true },
    ruleId: { type: Schema.Types.ObjectId, ref: 'Rule', required: true, index: true },
    ruleName: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
    recipient: {
      type: { type: String, enum: RECIPIENT_TYPES, required: true },
      value: { type: String, required: true },
      userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },

    subject: { type: String, required: true },
    body: { type: String, required: true },

    status: { type: String, enum: DELIVERY_STATUSES, default: 'PENDING', required: true },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true, min: 1 },
    nextAttemptAt: { type: Date, default: () => new Date() },
    lastError: { type: String, default: null },
    providerMessageId: { type: String, default: null },
    sentAt: { type: Date, default: null },

    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null },

    dedupeKey: { type: String, required: true },

    readAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// The guarantee behind "no duplicate notifications".
deliverySchema.index({ dedupeKey: 1 }, { unique: true });
// The worker's claim query.
deliverySchema.index({ status: 1, nextAttemptAt: 1 });
// Stale lock reaper.
deliverySchema.index({ status: 1, lockedAt: 1 });
// History table default view.
deliverySchema.index({ ownerId: 1, createdAt: -1 });
// In-app inbox.
deliverySchema.index({ 'recipient.userId': 1, channel: 1, readAt: 1, createdAt: -1 });

export type DeliveryDocument = HydratedDocument<DeliveryAttributes>;

export const DeliveryModel: Model<DeliveryAttributes> = model<DeliveryAttributes>(
  'Delivery',
  deliverySchema,
);

export const toDeliveryDto = (delivery: DeliveryDocument): DeliveryDto => ({
  id: delivery.id as string,
  eventId: delivery.eventId,
  eventType: delivery.eventType,
  ruleId: String(delivery.ruleId),
  ruleName: delivery.ruleName,
  channel: delivery.channel,
  recipient: {
    type: delivery.recipient.type,
    value: delivery.recipient.value,
    ...(delivery.recipient.userId ? { userId: String(delivery.recipient.userId) } : {}),
  },
  subject: delivery.subject,
  body: delivery.body,
  status: delivery.status,
  attempts: delivery.attempts,
  maxAttempts: delivery.maxAttempts,
  ...(delivery.nextAttemptAt ? { nextAttemptAt: delivery.nextAttemptAt.toISOString() } : {}),
  ...(delivery.lastError ? { lastError: delivery.lastError } : {}),
  ...(delivery.providerMessageId ? { providerMessageId: delivery.providerMessageId } : {}),
  ...(delivery.readAt ? { readAt: delivery.readAt.toISOString() } : {}),
  ...(delivery.sentAt ? { sentAt: delivery.sentAt.toISOString() } : {}),
  createdAt: delivery.createdAt.toISOString(),
  updatedAt: delivery.updatedAt.toISOString(),
});
