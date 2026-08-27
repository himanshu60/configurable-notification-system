import { env } from '../config/env.js';
import { createLogger } from '../common/logger.js';
import { getChannelAdapter } from '../channels/channel.registry.js';
import type { DeliveryContext } from '../channels/channel.adapter.js';
import { DeliveryModel, type DeliveryDocument } from '../modules/deliveries/delivery.model.js';
import { nextAttemptDate, type BackoffOptions } from './backoff.js';

const log = createLogger('worker');

const backoffOptions: BackoffOptions = {
  baseMs: env.DELIVERY_BACKOFF_BASE_MS,
  maxMs: env.DELIVERY_BACKOFF_MAX_MS,
};

/**
 * Takes ownership of exactly one due delivery.
 *
 * `findOneAndUpdate` is a single atomic operation in MongoDB, so the status
 * transition PENDING -> PROCESSING is the lock. Two workers racing for the same
 * row cannot both win: the loser's filter no longer matches and it gets the
 * next row instead. This is what allows the API to be scaled horizontally with
 * no coordination service.
 */
export const claimNextDelivery = async (workerId: string): Promise<DeliveryDocument | null> => {
  const now = new Date();

  return DeliveryModel.findOneAndUpdate(
    {
      status: { $in: ['PENDING', 'FAILED'] },
      nextAttemptAt: { $lte: now },
    },
    {
      $set: { status: 'PROCESSING', lockedAt: now, lockedBy: workerId },
      $inc: { attempts: 1 },
    },
    { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: 'after' },
  );
};

/**
 * Returns rows whose worker died mid-attempt.
 *
 * Without this, a crash between the claim and the result would strand a
 * delivery in PROCESSING forever. The visibility timeout bounds how long that
 * can last, which is the same guarantee a real queue gives.
 */
export const reclaimStaleDeliveries = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - env.WORKER_VISIBILITY_TIMEOUT_MS);

  const result = await DeliveryModel.updateMany(
    { status: 'PROCESSING', lockedAt: { $lt: cutoff } },
    { $set: { status: 'PENDING', lockedAt: null, lockedBy: null, nextAttemptAt: new Date() } },
  );

  if (result.modifiedCount > 0) {
    log.warn({ count: result.modifiedCount }, 'Reclaimed deliveries from a stale lock');
  }

  return result.modifiedCount;
};

const toContext = (delivery: DeliveryDocument): DeliveryContext => ({
  deliveryId: delivery.id as string,
  eventId: delivery.eventId,
  eventType: delivery.eventType,
  ruleId: String(delivery.ruleId),
  ruleName: delivery.ruleName,
  recipient: {
    type: delivery.recipient.type,
    value: delivery.recipient.value,
    ...(delivery.recipient.userId ? { userId: String(delivery.recipient.userId) } : {}),
  },
  subject: delivery.subject,
  body: delivery.body,
  attempt: delivery.attempts,
});

/** Runs one claimed delivery through its channel and records the outcome. */
export const processDelivery = async (delivery: DeliveryDocument): Promise<void> => {
  const adapter = getChannelAdapter(delivery.channel);

  let outcome;
  try {
    outcome = await adapter.send(toContext(delivery));
  } catch (error) {
    // An adapter that throws is treated as a retryable failure rather than
    // being allowed to kill the polling loop.
    outcome = {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Channel adapter threw',
      retryable: true,
    };
  }

  if (outcome.ok) {
    delivery.set({
      status: 'SENT',
      sentAt: new Date(),
      providerMessageId: outcome.providerMessageId,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      nextAttemptAt: null,
    });
    await delivery.save();
    return;
  }

  const exhausted = delivery.attempts >= delivery.maxAttempts;
  const permanent = !outcome.retryable;

  if (exhausted || permanent) {
    delivery.set({
      status: 'DEAD_LETTER',
      lastError: outcome.error,
      lockedAt: null,
      lockedBy: null,
      nextAttemptAt: null,
    });
    await delivery.save();

    log.error(
      {
        deliveryId: delivery.id,
        channel: delivery.channel,
        attempts: delivery.attempts,
        reason: permanent ? 'permanent-failure' : 'attempts-exhausted',
      },
      'Delivery moved to the dead letter state',
    );
    return;
  }

  const retryAt = nextAttemptDate(delivery.attempts, backoffOptions);

  delivery.set({
    status: 'FAILED',
    lastError: outcome.error,
    lockedAt: null,
    lockedBy: null,
    nextAttemptAt: retryAt,
  });
  await delivery.save();

  log.warn(
    { deliveryId: delivery.id, attempt: delivery.attempts, retryAt: retryAt.toISOString() },
    'Delivery failed, retry scheduled',
  );
};

/** Drains up to `batchSize` due deliveries. Returns how many were handled. */
export const runDispatchCycle = async (
  workerId = env.WORKER_ID,
  batchSize = env.WORKER_BATCH_SIZE,
): Promise<number> => {
  await reclaimStaleDeliveries();

  let processed = 0;

  for (let index = 0; index < batchSize; index += 1) {
    const delivery = await claimNextDelivery(workerId);
    if (!delivery) break;

    await processDelivery(delivery);
    processed += 1;
  }

  return processed;
};

/**
 * Long-lived polling loop.
 *
 * Polling MongoDB is the deliberate trade-off documented in ARCHITECTURE.md: it
 * needs no extra infrastructure and the claim semantics are identical to a real
 * queue, so replacing this loop with BullMQ or SQS touches only this file.
 */
export class DeliveryDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;
  private inFlight: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly workerId: string = env.WORKER_ID,
    private readonly pollIntervalMs: number = env.WORKER_POLL_INTERVAL_MS,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopped = false;
    log.info({ workerId: this.workerId, pollIntervalMs: this.pollIntervalMs }, 'Dispatcher started');
    this.schedule(0);
  }

  /** Stops polling and waits for the cycle already in progress to finish. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.inFlight;
    log.info({ workerId: this.workerId }, 'Dispatcher stopped');
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;

    this.timer = setTimeout(() => {
      this.inFlight = this.tick();
      void this.inFlight;
    }, delayMs);

    // Never hold the process open just because a poll is pending.
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    try {
      const processed = await runDispatchCycle(this.workerId);
      // A full batch means there is probably more waiting, so poll again
      // immediately instead of idling for the full interval.
      this.schedule(processed >= env.WORKER_BATCH_SIZE ? 0 : this.pollIntervalMs);
    } catch (error) {
      log.error({ err: error }, 'Dispatch cycle failed');
      this.schedule(this.pollIntervalMs);
    }
  }
}
