import { createLogger } from '../common/logger.js';
import {
  failure,
  success,
  type DeliveryContext,
  type DeliveryOutcome,
  type NotificationChannelAdapter,
} from './channel.adapter.js';

const log = createLogger('channel:in-app');

/**
 * In-app delivery has no external provider: the delivery row itself is the
 * notification the inbox reads. Marking it SENT is what makes it visible, so
 * this adapter only has to assert that the row is addressable to a user.
 */
export class InAppChannelAdapter implements NotificationChannelAdapter {
  readonly channel = 'IN_APP' as const;
  readonly displayName = 'In-app inbox';

  async send(context: DeliveryContext): Promise<DeliveryOutcome> {
    if (!context.recipient.userId) {
      // A bare email address has no inbox to deliver into, and never will.
      return failure(
        `In-app delivery needs a known user; "${context.recipient.value}" is not registered`,
        false,
      );
    }

    log.info(
      { deliveryId: context.deliveryId, userId: context.recipient.userId },
      'In-app notification published',
    );

    return success(`inapp-${context.deliveryId}`);
  }
}
