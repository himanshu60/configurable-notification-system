/**
 * Domain vocabulary shared by the API and the client.
 *
 * These are const tuples rather than TypeScript `enum`s so that a single
 * declaration gives us the runtime list (for zod, for dropdowns) and the
 * literal union type, with no separate mapping to keep in sync.
 */

export const NOTIFICATION_CHANNELS = ['EMAIL', 'IN_APP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const CONDITION_LOGIC = ['AND', 'OR'] as const;
export type ConditionLogic = (typeof CONDITION_LOGIC)[number];

export const RECIPIENT_TYPES = ['USER', 'EMAIL', 'ROLE'] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];

export const USER_ROLES = ['ADMIN', 'USER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const FIELD_TYPES = ['string', 'number', 'boolean', 'date', 'enum'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const CONDITION_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'in',
  'not_in',
  'exists',
  'not_exists',
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const EVENT_STATUSES = ['RECEIVED', 'PROCESSED', 'FAILED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/**
 * Lifecycle of a single delivery attempt record.
 *
 *   PENDING ─claim─> PROCESSING ─ok──> SENT
 *      ^                  │
 *      └──retry (backoff)─┴─fail─> FAILED ──attempts exhausted──> DEAD_LETTER
 *
 * SUPPRESSED is terminal and means the delivery was never attempted because an
 * identical one already existed inside the rule's dedupe window.
 */
export const DELIVERY_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
  'DEAD_LETTER',
  'SUPPRESSED',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Statuses a delivery can no longer move out of on its own. */
export const TERMINAL_DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  'SENT',
  'DEAD_LETTER',
  'SUPPRESSED',
];

/**
 * Which operators make sense for which field type. Consumed by the API when it
 * validates a rule and by the condition builder when it populates the operator
 * dropdown, so the two can never disagree.
 */
export const OPERATORS_BY_FIELD_TYPE: Readonly<Record<FieldType, readonly ConditionOperator[]>> = {
  string: [
    'eq',
    'neq',
    'contains',
    'not_contains',
    'starts_with',
    'ends_with',
    'in',
    'not_in',
    'exists',
    'not_exists',
  ],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'not_in', 'exists', 'not_exists'],
  boolean: ['eq', 'neq', 'exists', 'not_exists'],
  date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'exists', 'not_exists'],
  enum: ['eq', 'neq', 'in', 'not_in', 'exists', 'not_exists'],
};

/** Operators that ignore the `value` field entirely. */
export const UNARY_OPERATORS: readonly ConditionOperator[] = ['exists', 'not_exists'];

/** Operators whose `value` must be a list. */
export const LIST_OPERATORS: readonly ConditionOperator[] = ['in', 'not_in'];

/** Operators whose `value` must be an inclusive `[from, to]` pair. */
export const RANGE_OPERATORS: readonly ConditionOperator[] = ['between'];

export const OPERATOR_LABELS: Readonly<Record<ConditionOperator, string>> = {
  eq: 'is equal to',
  neq: 'is not equal to',
  gt: 'is greater than',
  gte: 'is greater than or equal to',
  lt: 'is less than',
  lte: 'is less than or equal to',
  between: 'is between',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  in: 'is any of',
  not_in: 'is none of',
  exists: 'is present',
  not_exists: 'is not present',
};

export const CHANNEL_LABELS: Readonly<Record<NotificationChannel, string>> = {
  EMAIL: 'Email',
  IN_APP: 'In-app',
};

export const DELIVERY_STATUS_LABELS: Readonly<Record<DeliveryStatus, string>> = {
  PENDING: 'Pending',
  PROCESSING: 'Sending',
  SENT: 'Sent',
  FAILED: 'Retrying',
  DEAD_LETTER: 'Failed',
  SUPPRESSED: 'Suppressed',
};
