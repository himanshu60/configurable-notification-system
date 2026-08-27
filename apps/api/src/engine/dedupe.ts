import { createHash } from 'node:crypto';
import type { NotificationChannel } from '@cns/shared';

export interface DedupeInput {
  ruleId: string;
  channel: NotificationChannel;
  recipient: string;
  eventId: string;
  /** 0 disables windowing and dedupes per event only. */
  dedupeWindowSec: number;
  now?: Date;
}

/**
 * Builds the fingerprint that the unique index on `deliveries.dedupeKey`
 * enforces.
 *
 * Two independent duplicate problems are solved by choosing what goes into it:
 *
 *  - `dedupeWindowSec = 0` keys on the event id, so an at-least-once producer
 *    redelivering the same event can never produce a second notification.
 *  - `dedupeWindowSec > 0` keys on a floored time bucket instead, so a burst of
 *    *distinct* events matching the same rule collapses into one notification
 *    per recipient per window.
 */
export const buildDedupeKey = (input: DedupeInput): string => {
  const scope =
    input.dedupeWindowSec > 0
      ? `w:${Math.floor((input.now ?? new Date()).getTime() / (input.dedupeWindowSec * 1000))}`
      : `e:${input.eventId}`;

  const fingerprint = [input.ruleId, input.channel, input.recipient.toLowerCase(), scope].join('|');

  return createHash('sha256').update(fingerprint).digest('hex');
};
