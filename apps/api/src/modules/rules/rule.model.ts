import { Schema, type Types, model, type HydratedDocument, type Model } from 'mongoose';
import {
  CONDITION_LOGIC,
  CONDITION_OPERATORS,
  NOTIFICATION_CHANNELS,
  RECIPIENT_TYPES,
  type ConditionLogic,
  type ConditionOperator,
  type ConditionValue,
  type NotificationChannel,
  type RecipientType,
  type RuleDto,
} from '@cns/shared';

/**
 * Declared explicitly rather than inferred from the schema: the inferred shape
 * makes every nested object nullable, which forces defensive checks on paths
 * the schema already guarantees.
 */
export interface RuleAttributes {
  name: string;
  description: string;
  ownerId: Types.ObjectId;
  eventType: string;
  enabled: boolean;
  priority: number;
  conditions: {
    logic: ConditionLogic;
    items: Array<{ field: string; operator: ConditionOperator; value?: ConditionValue }>;
  };
  recipients: Array<{ type: RecipientType; value: string }>;
  channels: NotificationChannel[];
  template: { subject: string; body: string };
  dedupeWindowSec: number;
  createdAt: Date;
  updatedAt: Date;
}

const conditionSchema = new Schema(
  {
    field: { type: String, required: true, trim: true },
    operator: { type: String, enum: CONDITION_OPERATORS, required: true },
    // Mixed because the value shape depends on the operator; the zod schema in
    // @cns/shared is what guarantees the arity before a document gets here.
    value: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const recipientSchema = new Schema(
  {
    type: { type: String, enum: RECIPIENT_TYPES, required: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const ruleSchema = new Schema<RuleAttributes>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    eventType: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    priority: { type: Number, default: 50, min: 0, max: 100 },
    conditions: {
      logic: { type: String, enum: CONDITION_LOGIC, default: 'AND' },
      items: { type: [conditionSchema], default: [] },
    },
    recipients: { type: [recipientSchema], required: true },
    channels: [{ type: String, enum: NOTIFICATION_CHANNELS, required: true }],
    template: {
      subject: { type: String, required: true, maxlength: 200 },
      body: { type: String, required: true, maxlength: 5000 },
    },
    dedupeWindowSec: { type: Number, default: 0, min: 0, max: 86_400 },
  },
  { timestamps: true, versionKey: false },
);

// The matcher's hot path: every ingested event runs exactly this query.
ruleSchema.index({ eventType: 1, enabled: 1, priority: 1 });
// Backs the rule list's default sort.
ruleSchema.index({ ownerId: 1, updatedAt: -1 });
// Enforces the friendly "you already have a rule with this name" conflict.
ruleSchema.index({ ownerId: 1, name: 1 }, { unique: true });

export type RuleDocument = HydratedDocument<RuleAttributes>;

export const RuleModel: Model<RuleAttributes> = model<RuleAttributes>('Rule', ruleSchema);

export const toRuleDto = (rule: RuleDocument): RuleDto => ({
  id: rule.id as string,
  name: rule.name,
  description: rule.description,
  eventType: rule.eventType,
  enabled: rule.enabled,
  priority: rule.priority,
  conditions: {
    logic: rule.conditions.logic,
    items: rule.conditions.items.map((item) => ({
      field: item.field,
      operator: item.operator,
      ...(item.value === undefined ? {} : { value: item.value }),
    })),
  },
  recipients: rule.recipients.map((recipient) => ({
    type: recipient.type,
    value: recipient.value,
  })),
  channels: [...rule.channels],
  template: { subject: rule.template.subject, body: rule.template.body },
  dedupeWindowSec: rule.dedupeWindowSec,
  createdAt: rule.createdAt.toISOString(),
  updatedAt: rule.updatedAt.toISOString(),
});
