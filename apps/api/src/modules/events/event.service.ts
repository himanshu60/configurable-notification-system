import { randomUUID } from 'node:crypto';
import type { QueryFilter } from 'mongoose';
import type {
  EventQuery,
  IngestEventInput,
  IngestEventResultDto,
  PaginationMeta,
  EventDto,
} from '@cns/shared';
import { AppError } from '../../common/app-error.js';
import { buildPaginationMeta } from '../../common/http.js';
import { createLogger } from '../../common/logger.js';
import { fanOutToDeliveries, matchRules } from '../../engine/rule-matcher.js';
import { isKnownEventType, eventTypeNames } from '../catalog/event-catalog.js';
import { EventModel, toEventDto, type EventAttributes } from './event.model.js';

const log = createLogger('ingest');

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;

/**
 * Accepts an event, evaluates every enabled rule for its type and queues the
 * resulting notifications.
 *
 * Idempotency is enforced by the unique index on `eventId`: the insert is the
 * claim. If it collides, another request already owns this event and we return
 * that event's outcome instead of processing it a second time. That holds even
 * when two copies of the same event arrive concurrently on different instances.
 */
export const ingestEvent = async (input: IngestEventInput): Promise<IngestEventResultDto> => {
  if (!isKnownEventType(input.type)) {
    throw AppError.badRequest(`Unknown event type "${input.type}"`, [
      { path: 'type', message: `Supported types: ${eventTypeNames().join(', ')}` },
    ]);
  }

  const eventId = input.eventId ?? randomUUID();
  const occurredAt = input.occurredAt ?? new Date();

  let event;
  try {
    event = await EventModel.create({
      eventId,
      type: input.type,
      source: input.source,
      payload: input.payload,
      status: 'RECEIVED',
      occurredAt,
      receivedAt: new Date(),
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const existing = await EventModel.findOne({ eventId });
    if (!existing) throw error;

    log.info({ eventId }, 'Duplicate event ignored');
    return {
      event: toEventDto(existing),
      duplicate: true,
      matchedRules: [],
      deliveriesCreated: 0,
      deliveriesSuppressed: 0,
    };
  }

  try {
    const matches = await matchRules(input.type, input.payload);
    const result = await fanOutToDeliveries(
      {
        eventId,
        eventType: input.type,
        source: input.source,
        occurredAt,
        payload: input.payload,
      },
      matches,
    );

    event.status = 'PROCESSED';
    event.matchedRuleIds = matches.map(({ rule }) => rule._id);
    event.deliveryCount = result.created;
    event.suppressedCount = result.suppressed;
    event.processedAt = new Date();
    await event.save();

    log.info(
      { eventId, matched: matches.length, created: result.created, suppressed: result.suppressed },
      'Event processed',
    );

    return {
      event: toEventDto(event),
      duplicate: false,
      matchedRules: result.matchedRules,
      deliveriesCreated: result.created,
      deliveriesSuppressed: result.suppressed,
    };
  } catch (error) {
    // The event row survives in FAILED state so the failure is visible in the
    // event log and the ingest can be replayed rather than silently lost.
    event.status = 'FAILED';
    event.error = error instanceof Error ? error.message : 'Unknown processing failure';
    event.processedAt = new Date();
    await event.save();

    log.error({ err: error, eventId }, 'Event processing failed');
    throw error;
  }
};

export const listEvents = async (
  query: EventQuery,
): Promise<{ events: EventDto[]; meta: PaginationMeta }> => {
  const filter: QueryFilter<EventAttributes> = {};
  if (query.type) filter['type'] = query.type;
  if (query.status) filter['status'] = query.status;
  if (query.search) filter['eventId'] = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const [documents, total] = await Promise.all([
    EventModel.find(filter)
      .sort({ createdAt: query.sortOrder === 'asc' ? 1 : -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    EventModel.countDocuments(filter),
  ]);

  return {
    events: documents.map(toEventDto),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const getEvent = async (id: string): Promise<EventDto> => {
  const event = await EventModel.findById(id);
  if (!event) throw AppError.notFound('Event');
  return toEventDto(event);
};
