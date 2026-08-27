import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { createLogger } from '../common/logger.js';
import {
  failure,
  success,
  type DeliveryContext,
  type DeliveryOutcome,
  type NotificationChannelAdapter,
} from './channel.adapter.js';

const log = createLogger('channel:email');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Failure injection knobs, seeded from the environment but mutable at runtime.
 *
 * Reading these on every send rather than closing over the env at import time
 * is what lets an operator demo the retry path (`MOCK_EMAIL_FAILURE_RATE=1`)
 * and lets the worker tests drive a delivery deterministically through
 * failure, backoff and the dead letter state.
 */
export const mockEmailConfig = {
  failureRate: env.MOCK_EMAIL_FAILURE_RATE,
  minLatencyMs: env.MOCK_EMAIL_MIN_LATENCY_MS,
  maxLatencyMs: env.MOCK_EMAIL_MAX_LATENCY_MS,
};

/**
 * Stand-in for a real provider (SES, SendGrid, Postmark).
 *
 * Deliberately imperfect: it takes a variable amount of time and fails at a
 * configurable rate, so the retry, backoff and dead-letter paths can be
 * demonstrated end to end without a live account. Swapping in a real provider
 * means replacing the body of `send` and nothing else.
 */
export class EmailChannelAdapter implements NotificationChannelAdapter {
  readonly channel = 'EMAIL' as const;
  readonly displayName = 'Email (mock SMTP)';

  async send(context: DeliveryContext): Promise<DeliveryOutcome> {
    if (!EMAIL_PATTERN.test(context.recipient.value)) {
      // A bad address will never succeed, so do not spend retries on it.
      return failure(`"${context.recipient.value}" is not a deliverable address`, false);
    }

    const spread = Math.max(0, mockEmailConfig.maxLatencyMs - mockEmailConfig.minLatencyMs);
    await wait(mockEmailConfig.minLatencyMs + Math.random() * spread);

    if (Math.random() < mockEmailConfig.failureRate) {
      return failure('Upstream SMTP provider returned 421 Service not available', true);
    }

    const providerMessageId = `smtp-${randomUUID()}`;

    log.info(
      {
        deliveryId: context.deliveryId,
        to: context.recipient.value,
        subject: context.subject,
        providerMessageId,
        attempt: context.attempt,
      },
      'Email dispatched',
    );

    return success(providerMessageId);
  }
}
