import type { NotificationChannel } from '@cns/shared';
import { AppError } from '../common/app-error.js';
import type { NotificationChannelAdapter } from './channel.adapter.js';
import { EmailChannelAdapter } from './email.channel.js';
import { InAppChannelAdapter } from './in-app.channel.js';

/**
 * The one place a channel is wired in.
 *
 * To add SMS: implement `NotificationChannelAdapter`, add the literal to
 * `NOTIFICATION_CHANNELS` in @cns/shared, and add one line below. The exhaustive
 * `Record` makes the compiler point at this file if the two ever drift.
 */
const adapters: Record<NotificationChannel, NotificationChannelAdapter> = {
  EMAIL: new EmailChannelAdapter(),
  IN_APP: new InAppChannelAdapter(),
};

export const getChannelAdapter = (channel: NotificationChannel): NotificationChannelAdapter => {
  const adapter = adapters[channel];
  if (!adapter) {
    throw AppError.internal(`No adapter registered for channel "${channel}"`);
  }
  return adapter;
};

export const registeredChannels = (): NotificationChannelAdapter[] => Object.values(adapters);
