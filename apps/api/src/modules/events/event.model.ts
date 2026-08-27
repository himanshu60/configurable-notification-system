import { Schema, type Types, model, type HydratedDocument, type Model } from 'mongoose';
import { EVENT_STATUSES, type EventDto, type EventStatus } from '@cns/shared';

export interface EventAttributes {
  /** Producer supplied idempotency key. Unique across the collection. */
  eventId: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  status: EventStatus;
  matchedRuleIds: Types.ObjectId[];
  deliveryCount: number;
  suppressedCount: number;
  error?: string | null;
  occurredAt: Date;
  receivedAt: Date;
  processedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<EventAttributes>(
  {
    eventId: { type: String, required: true },
    type: { type: String, required: true, index: true },
    source: { type: String, default: 'api' },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: EVENT_STATUSES, default: 'RECEIVED', required: true },
    matchedRuleIds: [{ type: Schema.Types.ObjectId, ref: 'Rule' }],
    deliveryCount: { type: Number, default: 0 },
    suppressedCount: { type: Number, default: 0 },
    error: { type: String, default: null },
    occurredAt: { type: Date, required: true },
    receivedAt: { type: Date, default: () => new Date() },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

/**
 * The idempotency guarantee: a redelivered event cannot be inserted twice, so
 * the duplicate is detected by the database rather than by a read-then-write
 * race in application code.
 */
eventSchema.index({ eventId: 1 }, { unique: true });
eventSchema.index({ createdAt: -1 });
eventSchema.index({ type: 1, status: 1, createdAt: -1 });

export type EventDocument = HydratedDocument<EventAttributes>;

export const EventModel: Model<EventAttributes> = model<EventAttributes>('Event', eventSchema);

export const toEventDto = (event: EventDocument): EventDto => ({
  id: event.id as string,
  eventId: event.eventId,
  type: event.type,
  source: event.source,
  status: event.status,
  payload: event.payload,
  matchedRuleIds: event.matchedRuleIds.map(String),
  deliveryCount: event.deliveryCount,
  suppressedCount: event.suppressedCount,
  ...(event.error ? { error: event.error } : {}),
  occurredAt: event.occurredAt.toISOString(),
  receivedAt: event.receivedAt.toISOString(),
  ...(event.processedAt ? { processedAt: event.processedAt.toISOString() } : {}),
});
