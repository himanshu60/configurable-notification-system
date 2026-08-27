import { Types, type QueryFilter } from 'mongoose';
import {
  DELIVERY_STATUSES,
  NOTIFICATION_CHANNELS,
  type DeliveryDto,
  type DeliveryQuery,
  type DeliveryStatsDto,
  type DeliveryStatus,
  type InboxQuery,
  type PaginationMeta,
} from '@cns/shared';
import { AppError } from '../../common/app-error.js';
import { buildPaginationMeta } from '../../common/http.js';
import { EventModel } from '../events/event.model.js';
import { RuleModel } from '../rules/rule.model.js';
import { DeliveryModel, toDeliveryDto, type DeliveryAttributes } from './delivery.model.js';

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildHistoryFilter = (
  ownerId: string,
  query: DeliveryQuery,
): QueryFilter<DeliveryAttributes> => {
  const filter: QueryFilter<DeliveryAttributes> = { ownerId };

  if (query.channel) filter['channel'] = query.channel;
  if (query.status) filter['status'] = query.status;
  if (query.ruleId) filter['ruleId'] = query.ruleId;
  if (query.recipient) filter['recipient.value'] = new RegExp(escapeRegex(query.recipient), 'i');
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter['$or'] = [{ subject: pattern }, { ruleName: pattern }, { eventId: pattern }];
  }
  if (query.from || query.to) {
    filter['createdAt'] = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }

  return filter;
};

export const listDeliveries = async (
  ownerId: string,
  query: DeliveryQuery,
): Promise<{ deliveries: DeliveryDto[]; meta: PaginationMeta }> => {
  const filter = buildHistoryFilter(ownerId, query);

  const [documents, total] = await Promise.all([
    DeliveryModel.find(filter)
      .sort({ createdAt: query.sortOrder === 'asc' ? 1 : -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    DeliveryModel.countDocuments(filter),
  ]);

  return {
    deliveries: documents.map(toDeliveryDto),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const getDelivery = async (ownerId: string, id: string): Promise<DeliveryDto> => {
  const delivery = await DeliveryModel.findOne({ _id: id, ownerId });
  if (!delivery) throw AppError.notFound('Notification');
  return toDeliveryDto(delivery);
};

/**
 * The in-app inbox. Scoped by recipient rather than by rule owner: you see what
 * was sent *to you*, not what your rules sent to other people.
 */
export const listInbox = async (
  userId: string,
  query: InboxQuery,
): Promise<{ deliveries: DeliveryDto[]; meta: PaginationMeta; unreadCount: number }> => {
  const filter: QueryFilter<DeliveryAttributes> = {
    'recipient.userId': userId,
    channel: 'IN_APP',
    status: 'SENT',
    ...(query.unreadOnly === 'true' ? { readAt: null } : {}),
  };

  const [documents, total, unreadCount] = await Promise.all([
    DeliveryModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    DeliveryModel.countDocuments(filter),
    DeliveryModel.countDocuments({
      'recipient.userId': userId,
      channel: 'IN_APP',
      status: 'SENT',
      readAt: null,
    }),
  ]);

  return {
    deliveries: documents.map(toDeliveryDto),
    meta: buildPaginationMeta(query.page, query.limit, total),
    unreadCount,
  };
};

export const markRead = async (userId: string, id: string): Promise<DeliveryDto> => {
  const delivery = await DeliveryModel.findOneAndUpdate(
    { _id: id, 'recipient.userId': userId, readAt: null },
    { $set: { readAt: new Date() } },
    { returnDocument: 'after' },
  );

  if (!delivery) {
    // Already read, or not addressed to this user - both are 404 from here.
    const existing = await DeliveryModel.findOne({ _id: id, 'recipient.userId': userId });
    if (!existing) throw AppError.notFound('Notification');
    return toDeliveryDto(existing);
  }

  return toDeliveryDto(delivery);
};

export const markAllRead = async (userId: string): Promise<number> => {
  const result = await DeliveryModel.updateMany(
    { 'recipient.userId': userId, channel: 'IN_APP', status: 'SENT', readAt: null },
    { $set: { readAt: new Date() } },
  );
  return result.modifiedCount;
};

/**
 * Puts a dead-lettered delivery back in the queue with a fresh attempt budget.
 * Operators need this for the "the provider was down for an hour" case.
 */
export const retryDelivery = async (ownerId: string, id: string): Promise<DeliveryDto> => {
  const delivery = await DeliveryModel.findOne({ _id: id, ownerId });
  if (!delivery) throw AppError.notFound('Notification');

  if (delivery.status !== 'DEAD_LETTER' && delivery.status !== 'FAILED') {
    throw AppError.conflict(`Only failed notifications can be retried (this one is ${delivery.status})`);
  }

  delivery.set({
    status: 'PENDING',
    attempts: 0,
    nextAttemptAt: new Date(),
    lastError: null,
    lockedAt: null,
    lockedBy: null,
  });
  await delivery.save();

  return toDeliveryDto(delivery);
};

const emptyTotals = (): Record<DeliveryStatus, number> =>
  Object.fromEntries(DELIVERY_STATUSES.map((status) => [status, 0])) as Record<
    DeliveryStatus,
    number
  >;

export const getStats = async (ownerId: string): Promise<DeliveryStatsDto> => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [statusGroups, channelGroups, ruleTotal, ruleEnabled, eventTotal, eventRecent] =
    await Promise.all([
      DeliveryModel.aggregate<{ _id: DeliveryStatus; count: number }>([
        { $match: { ownerId: new Types.ObjectId(ownerId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      DeliveryModel.aggregate<{ _id: { channel: string; status: string }; count: number }>([
        { $match: { ownerId: new Types.ObjectId(ownerId) } },
        { $group: { _id: { channel: '$channel', status: '$status' }, count: { $sum: 1 } } },
      ]),
      RuleModel.countDocuments({ ownerId }),
      RuleModel.countDocuments({ ownerId, enabled: true }),
      EventModel.countDocuments({}),
      EventModel.countDocuments({ createdAt: { $gte: since } }),
    ]);

  const totals = emptyTotals();
  for (const group of statusGroups) {
    totals[group._id] = group.count;
  }

  const byChannel = NOTIFICATION_CHANNELS.map((channel) => {
    const rows = channelGroups.filter((group) => group._id.channel === channel);
    const countFor = (statuses: string[]) =>
      rows
        .filter((row) => statuses.includes(row._id.status))
        .reduce((sum, row) => sum + row.count, 0);

    return {
      channel,
      sent: countFor(['SENT']),
      failed: countFor(['DEAD_LETTER']),
      pending: countFor(['PENDING', 'PROCESSING', 'FAILED']),
    };
  });

  const attempted = totals.SENT + totals.DEAD_LETTER;

  return {
    totals,
    byChannel,
    rules: { total: ruleTotal, enabled: ruleEnabled },
    events: { total: eventTotal, last24h: eventRecent },
    deliverySuccessRate: attempted === 0 ? 0 : Math.round((totals.SENT / attempted) * 1000) / 10,
  };
};
