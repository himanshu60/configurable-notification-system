import { z } from 'zod';
import {
  CONDITION_LOGIC,
  CONDITION_OPERATORS,
  LIST_OPERATORS,
  NOTIFICATION_CHANNELS,
  RANGE_OPERATORS,
  RECIPIENT_TYPES,
  UNARY_OPERATORS,
  USER_ROLES,
  type ConditionLogic,
  type ConditionOperator,
  type NotificationChannel,
  type RecipientType,
} from '../domain/enums.js';
import { objectIdSchema, paginationSchema, sortOrderSchema } from './common.schema.js';

export const conditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])).max(50, 'At most 50 values'),
]);

export type ConditionValue = z.infer<typeof conditionValueSchema>;

/**
 * A condition's `value` has a different shape per operator, so the arity rules
 * live here rather than being re-checked in the engine. Anything that survives
 * this schema is safe for `condition-evaluator` to run without defensive code.
 */
export const conditionSchema = z
  .object({
    field: z.string().trim().min(1, 'Choose a field').max(120),
    operator: z.enum(CONDITION_OPERATORS),
    value: conditionValueSchema.optional(),
  })
  .superRefine((condition, ctx) => {
    const { operator, value } = condition;

    if (UNARY_OPERATORS.includes(operator)) {
      return;
    }

    if (value === undefined || value === null || value === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'A value is required for this operator',
      });
      return;
    }

    if (LIST_OPERATORS.includes(operator)) {
      if (!Array.isArray(value) || value.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'Provide at least one value',
        });
      }
      return;
    }

    if (RANGE_OPERATORS.includes(operator)) {
      if (!Array.isArray(value) || value.length !== 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'Provide exactly two values: from and to',
        });
      }
      return;
    }

    if (Array.isArray(value)) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'This operator takes a single value',
      });
    }
  });

export const conditionGroupSchema = z.object({
  logic: z.enum(CONDITION_LOGIC).default('AND'),
  /** An empty group matches every event of the selected type. */
  items: z.array(conditionSchema).max(20, 'At most 20 conditions per rule').default([]),
});

export const recipientSchema = z
  .object({
    type: z.enum(RECIPIENT_TYPES),
    value: z.string().trim().min(1, 'Recipient is required').max(200),
  })
  .superRefine((recipient, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: 'custom', path: ['value'], message });

    switch (recipient.type) {
      case 'EMAIL':
        if (!z.email().safeParse(recipient.value).success) {
          fail('Enter a valid email address');
        }
        break;
      case 'USER':
        if (!objectIdSchema.safeParse(recipient.value).success) {
          fail('Select a valid user');
        }
        break;
      case 'ROLE':
        if (!USER_ROLES.includes(recipient.value as (typeof USER_ROLES)[number])) {
          fail(`Role must be one of: ${USER_ROLES.join(', ')}`);
        }
        break;
    }
  });

export const templateSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  body: z.string().trim().min(1, 'Message is required').max(5000),
});

export const createRuleSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(120),
  description: z.string().trim().max(500).default(''),
  eventType: z.string().trim().min(1, 'Choose a trigger'),
  enabled: z.boolean().default(true),
  /** Lower runs first when several rules match the same event. */
  priority: z.number().int().min(0).max(100).default(50),
  conditions: conditionGroupSchema.default({ logic: 'AND', items: [] }),
  recipients: z
    .array(recipientSchema)
    .min(1, 'Add at least one recipient')
    .max(20, 'At most 20 recipients'),
  channels: z
    .array(z.enum(NOTIFICATION_CHANNELS))
    .min(1, 'Select at least one channel')
    .max(NOTIFICATION_CHANNELS.length)
    .refine((channels) => new Set(channels).size === channels.length, {
      message: 'Channels must be unique',
    }),
  template: templateSchema,
  /**
   * Collapses identical notifications inside a rolling window. 0 disables it and
   * falls back to per-event deduplication only.
   */
  dedupeWindowSec: z.number().int().min(0).max(86_400).default(0),
});

export const updateRuleSchema = createRuleSchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  { message: 'Provide at least one field to update' },
);

export const toggleRuleSchema = z.object({ enabled: z.boolean() });

export const ruleTestSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
});

export const ruleQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  eventType: z.string().trim().optional(),
  channel: z.enum(NOTIFICATION_CHANNELS).optional(),
  enabled: z.enum(['true', 'false']).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'priority']).default('updatedAt'),
  sortOrder: sortOrderSchema,
});

export type ConditionInput = z.infer<typeof conditionSchema>;
export type ConditionGroupInput = z.infer<typeof conditionGroupSchema>;
export type RecipientInput = z.infer<typeof recipientSchema>;
export type TemplateInput = z.infer<typeof templateSchema>;
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
export type RuleQuery = z.infer<typeof ruleQuerySchema>;
export type RuleTestInput = z.infer<typeof ruleTestSchema>;

export interface RuleConditionDto {
  field: string;
  operator: ConditionOperator;
  value?: ConditionValue;
}

export interface RuleRecipientDto {
  type: RecipientType;
  value: string;
}

export interface RuleDto {
  id: string;
  name: string;
  description: string;
  eventType: string;
  enabled: boolean;
  priority: number;
  conditions: { logic: ConditionLogic; items: RuleConditionDto[] };
  recipients: RuleRecipientDto[];
  channels: NotificationChannel[];
  template: { subject: string; body: string };
  dedupeWindowSec: number;
  createdAt: string;
  updatedAt: string;
}

/** Result of `POST /rules/:id/test` — evaluated in memory, nothing is delivered. */
export interface RuleTestResultDto {
  matched: boolean;
  /** Per-condition outcome so the UI can point at the one that failed. */
  evaluations: Array<{
    field: string;
    operator: ConditionOperator;
    expected?: ConditionValue;
    actual: unknown;
    passed: boolean;
  }>;
  preview: Array<{
    channel: NotificationChannel;
    recipient: string;
    subject: string;
    body: string;
  }>;
}
