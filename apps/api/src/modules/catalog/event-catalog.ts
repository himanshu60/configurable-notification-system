import type { EventTypeDefinition } from '@cns/shared';

/**
 * The set of events the system understands.
 *
 * This registry is the single source of truth for both sides: the API validates
 * rule conditions against it, and the client builds its condition editor from
 * it. Supporting a new trigger is one entry here and nothing else.
 */
export const EVENT_CATALOG: readonly EventTypeDefinition[] = [
  {
    type: 'order.created',
    label: 'Order created',
    description: 'A customer placed a new order.',
    category: 'Orders',
    fields: [
      { path: 'order.id', label: 'Order ID', type: 'string' },
      {
        path: 'order.value',
        label: 'Order value',
        type: 'number',
        format: 'currency',
        description: 'Total order value in the order currency.',
      },
      {
        path: 'order.currency',
        label: 'Currency',
        type: 'enum',
        options: ['USD', 'EUR', 'GBP', 'INR'],
      },
      { path: 'order.itemCount', label: 'Item count', type: 'number' },
      { path: 'order.region', label: 'Region', type: 'enum', options: ['NA', 'EMEA', 'APAC'] },
      { path: 'order.expedited', label: 'Expedited', type: 'boolean' },
      { path: 'customer.id', label: 'Customer ID', type: 'string' },
      { path: 'customer.name', label: 'Customer name', type: 'string' },
      { path: 'customer.email', label: 'Customer email', type: 'string' },
      {
        path: 'customer.tier',
        label: 'Customer tier',
        type: 'enum',
        options: ['free', 'pro', 'enterprise'],
      },
      { path: 'order.placedAt', label: 'Placed at', type: 'date', format: 'date' },
    ],
    samplePayload: {
      order: {
        id: 'ORD-10241',
        value: 15000,
        currency: 'USD',
        itemCount: 7,
        region: 'NA',
        expedited: true,
        placedAt: '2026-08-27T09:15:00.000Z',
      },
      customer: {
        id: 'CUST-88',
        name: 'Acme Industries',
        email: 'ap@acme.example',
        tier: 'enterprise',
      },
    },
  },
  {
    type: 'payment.failed',
    label: 'Payment failed',
    description: 'A payment attempt was declined by the provider.',
    category: 'Billing',
    fields: [
      { path: 'payment.id', label: 'Payment ID', type: 'string' },
      { path: 'payment.amount', label: 'Amount', type: 'number', format: 'currency' },
      {
        path: 'payment.reason',
        label: 'Failure reason',
        type: 'enum',
        options: ['insufficient_funds', 'card_expired', 'fraud_suspected', 'network_error'],
      },
      { path: 'payment.attempt', label: 'Attempt number', type: 'number' },
      { path: 'payment.retryable', label: 'Retryable', type: 'boolean' },
      { path: 'customer.id', label: 'Customer ID', type: 'string' },
      { path: 'customer.email', label: 'Customer email', type: 'string' },
      {
        path: 'customer.tier',
        label: 'Customer tier',
        type: 'enum',
        options: ['free', 'pro', 'enterprise'],
      },
    ],
    samplePayload: {
      payment: {
        id: 'PAY-5512',
        amount: 2400,
        reason: 'insufficient_funds',
        attempt: 2,
        retryable: true,
      },
      customer: { id: 'CUST-88', email: 'ap@acme.example', tier: 'pro' },
    },
  },
  {
    type: 'ticket.created',
    label: 'Support ticket created',
    description: 'A customer opened a support ticket.',
    category: 'Support',
    fields: [
      { path: 'ticket.id', label: 'Ticket ID', type: 'string' },
      { path: 'ticket.subject', label: 'Subject', type: 'string' },
      {
        path: 'ticket.priority',
        label: 'Priority',
        type: 'enum',
        options: ['low', 'normal', 'high', 'urgent'],
      },
      { path: 'ticket.category', label: 'Category', type: 'string' },
      { path: 'ticket.slaBreached', label: 'SLA breached', type: 'boolean' },
      { path: 'customer.name', label: 'Customer name', type: 'string' },
      { path: 'customer.email', label: 'Customer email', type: 'string' },
    ],
    samplePayload: {
      ticket: {
        id: 'TCK-4410',
        subject: 'Cannot export invoices',
        priority: 'urgent',
        category: 'billing',
        slaBreached: false,
      },
      customer: { name: 'Acme Industries', email: 'ap@acme.example' },
    },
  },
  {
    type: 'user.signup',
    label: 'User signed up',
    description: 'A new user completed registration.',
    category: 'Growth',
    fields: [
      { path: 'user.id', label: 'User ID', type: 'string' },
      { path: 'user.email', label: 'Email', type: 'string' },
      { path: 'user.plan', label: 'Plan', type: 'enum', options: ['free', 'pro', 'enterprise'] },
      { path: 'user.referral', label: 'Referral source', type: 'string' },
      { path: 'user.signedUpAt', label: 'Signed up at', type: 'date', format: 'date' },
    ],
    samplePayload: {
      user: {
        id: 'USR-991',
        email: 'new.user@example.com',
        plan: 'pro',
        referral: 'partner-portal',
        signedUpAt: '2026-08-27T08:00:00.000Z',
      },
    },
  },
];

const BY_TYPE = new Map(EVENT_CATALOG.map((definition) => [definition.type, definition]));

export const findEventType = (type: string): EventTypeDefinition | undefined => BY_TYPE.get(type);

export const isKnownEventType = (type: string): boolean => BY_TYPE.has(type);

export const eventTypeNames = (): string[] => [...BY_TYPE.keys()];

/** Field metadata for one path, used to validate an operator against its type. */
export const findField = (eventType: string, path: string) =>
  findEventType(eventType)?.fields.find((field) => field.path === path);
