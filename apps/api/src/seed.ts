import bcrypt from 'bcryptjs';
import { env } from './config/env.js';
import { logger } from './common/logger.js';
import { connectDatabase, disconnectDatabase, syncIndexes } from './db/mongoose.js';
import { UserModel } from './modules/auth/user.model.js';
import { RuleModel } from './modules/rules/rule.model.js';
import { EventModel } from './modules/events/event.model.js';
import { DeliveryModel } from './modules/deliveries/delivery.model.js';

const DEMO_PASSWORD = 'Password123!';

/**
 * Puts the database in the state the README walkthrough assumes: one demo
 * account and a spread of rules that exercise every operator group, both
 * channels and the deduplication window.
 */
const seed = async (): Promise<void> => {
  await connectDatabase();
  await syncIndexes();

  await Promise.all([
    DeliveryModel.deleteMany({}),
    EventModel.deleteMany({}),
    RuleModel.deleteMany({}),
    UserModel.deleteMany({}),
  ]);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, env.BCRYPT_ROUNDS);

  const [admin, analyst] = await UserModel.create([
    { name: 'Dana Ops', email: 'demo@cns.dev', passwordHash, role: 'ADMIN' },
    { name: 'Sam Analyst', email: 'analyst@cns.dev', passwordHash, role: 'USER' },
  ]);

  if (!admin || !analyst) throw new Error('Failed to seed users');

  await RuleModel.create([
    {
      name: 'High value orders',
      description: 'The example from the brief: alert on orders above $10,000.',
      ownerId: admin._id,
      eventType: 'order.created',
      enabled: true,
      priority: 10,
      conditions: {
        logic: 'AND',
        items: [{ field: 'order.value', operator: 'gt', value: 10000 }],
      },
      recipients: [
        { type: 'USER', value: String(admin._id) },
        { type: 'EMAIL', value: 'finance@cns.dev' },
      ],
      channels: ['EMAIL', 'IN_APP'],
      template: {
        subject: 'High value order {{order.id}} - {{order.value | currency}}',
        body: 'Hi {{recipient.name}},\n\n{{customer.name}} placed order {{order.id}} for {{order.value | currency}} ({{order.itemCount}} items, {{order.region}}).\n\nCustomer tier: {{customer.tier | upper}}\nPlaced: {{order.placedAt | datetime}}',
      },
      dedupeWindowSec: 0,
    },
    {
      name: 'Enterprise expedited orders',
      description: 'Two conditions combined: enterprise tier and expedited shipping.',
      ownerId: admin._id,
      eventType: 'order.created',
      enabled: true,
      priority: 20,
      conditions: {
        logic: 'AND',
        items: [
          { field: 'customer.tier', operator: 'eq', value: 'enterprise' },
          { field: 'order.expedited', operator: 'eq', value: true },
        ],
      },
      recipients: [{ type: 'ROLE', value: 'ADMIN' }],
      channels: ['IN_APP'],
      template: {
        subject: 'Expedited enterprise order {{order.id}}',
        body: '{{customer.name}} needs order {{order.id}} expedited. Value {{order.value | currency}}.',
      },
      dedupeWindowSec: 0,
    },
    {
      name: 'Repeated payment failures',
      description: 'Throttled to one notification per recipient every 5 minutes.',
      ownerId: admin._id,
      eventType: 'payment.failed',
      enabled: true,
      priority: 30,
      conditions: {
        logic: 'AND',
        items: [
          { field: 'payment.attempt', operator: 'gte', value: 2 },
          {
            field: 'payment.reason',
            operator: 'in',
            value: ['insufficient_funds', 'card_expired'],
          },
        ],
      },
      recipients: [{ type: 'EMAIL', value: 'billing@cns.dev' }],
      channels: ['EMAIL'],
      template: {
        subject: 'Payment {{payment.id}} failed ({{payment.reason}})',
        body: 'Attempt {{payment.attempt}} for {{payment.amount | currency}} failed: {{payment.reason}}.',
      },
      dedupeWindowSec: 300,
    },
    {
      name: 'Urgent support tickets',
      description: 'Fires on urgent tickets only.',
      ownerId: admin._id,
      eventType: 'ticket.created',
      enabled: true,
      priority: 40,
      conditions: {
        logic: 'OR',
        items: [
          { field: 'ticket.priority', operator: 'eq', value: 'urgent' },
          { field: 'ticket.slaBreached', operator: 'eq', value: true },
        ],
      },
      recipients: [{ type: 'ROLE', value: 'USER' }],
      channels: ['EMAIL', 'IN_APP'],
      template: {
        subject: '[{{ticket.priority | upper}}] {{ticket.subject}}',
        body: '{{customer.name}} opened ticket {{ticket.id}} in {{ticket.category}}.',
      },
      dedupeWindowSec: 0,
    },
    {
      name: 'Enterprise signups (disabled)',
      description: 'Kept disabled to show the enable/disable toggle.',
      ownerId: admin._id,
      eventType: 'user.signup',
      enabled: false,
      priority: 50,
      conditions: {
        logic: 'AND',
        items: [{ field: 'user.plan', operator: 'eq', value: 'enterprise' }],
      },
      recipients: [{ type: 'EMAIL', value: 'growth@cns.dev' }],
      channels: ['EMAIL'],
      template: {
        subject: 'New enterprise signup: {{user.email}}',
        body: '{{user.email}} signed up on the {{user.plan}} plan via {{user.referral}}.',
      },
      dedupeWindowSec: 0,
    },
  ]);

  logger.info(
    { users: 2, rules: 5, login: { email: 'demo@cns.dev', password: DEMO_PASSWORD } },
    'Seed complete',
  );
};

seed()
  .then(() => disconnectDatabase())
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    logger.fatal({ err: error }, 'Seed failed');
    process.exit(1);
  });
