import type { NotificationChannel, RecipientType } from '@cns/shared';

export interface DeliveryContext {
  deliveryId: string;
  eventId: string;
  eventType: string;
  ruleId: string;
  ruleName: string;
  recipient: { type: RecipientType; value: string; userId?: string };
  subject: string;
  body: string;
  attempt: number;
}

export interface DeliverySuccess {
  ok: true;
  /** Provider side identifier, stored for support and traceability. */
  providerMessageId: string;
}

export interface DeliveryFailure {
  ok: false;
  error: string;
  /**
   * `false` marks a permanent failure - a malformed address, a rejected
   * recipient - which goes straight to the dead letter state instead of
   * burning the remaining retry budget.
   */
  retryable: boolean;
}

export type DeliveryOutcome = DeliverySuccess | DeliveryFailure;

/**
 * The extension point of the whole system.
 *
 * Supporting SMS, Slack or push means adding one file that implements this
 * interface and registering it - no change to the engine, the worker, the
 * models or the API.
 */
export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  readonly displayName: string;
  send(context: DeliveryContext): Promise<DeliveryOutcome>;
}

export const success = (providerMessageId: string): DeliverySuccess => ({
  ok: true,
  providerMessageId,
});

export const failure = (error: string, retryable = true): DeliveryFailure => ({
  ok: false,
  error,
  retryable,
});
