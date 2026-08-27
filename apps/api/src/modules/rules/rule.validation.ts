import {
  OPERATORS_BY_FIELD_TYPE,
  OPERATOR_LABELS,
  UNARY_OPERATORS,
  type ConditionGroupInput,
  type FieldIssue,
  type TemplateInput,
} from '@cns/shared';
import { AppError } from '../../common/app-error.js';
import { render } from '../../engine/template-renderer.js';
import { eventTypeNames, findEventType, findField } from '../catalog/event-catalog.js';

/**
 * Semantic validation that zod cannot express on its own, because it depends on
 * the event catalog: the trigger must exist, every condition must reference a
 * field of that trigger, and the operator must suit that field's type.
 */
export const assertRuleIsCoherent = (input: {
  eventType?: string;
  conditions?: ConditionGroupInput;
  template?: TemplateInput;
}): void => {
  const issues: FieldIssue[] = [];

  if (input.eventType !== undefined) {
    if (!findEventType(input.eventType)) {
      issues.push({
        path: 'eventType',
        message: `Unknown trigger. Supported triggers: ${eventTypeNames().join(', ')}`,
      });
    }
  }

  if (input.eventType && input.conditions) {
    const definition = findEventType(input.eventType);

    if (definition) {
      input.conditions.items.forEach((condition, index) => {
        const field = findField(input.eventType as string, condition.field);

        if (!field) {
          issues.push({
            path: `conditions.items.${index}.field`,
            message: `"${condition.field}" is not a field of ${input.eventType}`,
          });
          return;
        }

        const allowed = OPERATORS_BY_FIELD_TYPE[field.type];
        if (!allowed.includes(condition.operator)) {
          issues.push({
            path: `conditions.items.${index}.operator`,
            message: `"${OPERATOR_LABELS[condition.operator]}" cannot be used with a ${field.type} field`,
          });
          return;
        }

        if (field.type === 'enum' && field.options && !UNARY_OPERATORS.includes(condition.operator)) {
          const values = Array.isArray(condition.value) ? condition.value : [condition.value];
          const invalid = values.filter(
            (value) => value !== undefined && !field.options?.includes(String(value)),
          );

          if (invalid.length > 0) {
            issues.push({
              path: `conditions.items.${index}.value`,
              message: `Allowed values: ${field.options.join(', ')}`,
            });
          }
        }
      });
    }
  }

  if (input.template && input.eventType) {
    const definition = findEventType(input.eventType);

    if (definition) {
      // Rendering against the sample payload catches typos in template tokens at
      // save time instead of at delivery time.
      const context = {
        ...definition.samplePayload,
        event: { id: 'sample', type: definition.type, source: 'preview', occurredAt: '' },
        rule: { id: 'sample', name: 'preview' },
        recipient: { type: 'EMAIL', value: 'preview@example.com' },
        payload: definition.samplePayload,
      };

      const missing = [
        ...render(input.template.subject, context).missing,
        ...render(input.template.body, context).missing,
      ];

      const unknown = [...new Set(missing)].filter(
        (path) => !path.startsWith('event.') && !path.startsWith('rule.') && !path.startsWith('recipient.'),
      );

      if (unknown.length > 0) {
        issues.push({
          path: 'template',
          message: `Unknown template fields: ${unknown.join(', ')}`,
        });
      }
    }
  }

  if (issues.length > 0) {
    throw AppError.badRequest('The rule is not valid for the selected trigger', issues);
  }
};
