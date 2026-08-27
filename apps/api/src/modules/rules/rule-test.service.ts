import type { RuleTestResultDto } from '@cns/shared';
import { AppError } from '../../common/app-error.js';
import { evaluateGroup } from '../../engine/condition-evaluator.js';
import { buildTemplateContext } from '../../engine/rule-matcher.js';
import { resolveRecipients } from '../../engine/recipient-resolver.js';
import { render } from '../../engine/template-renderer.js';
import { findEventType } from '../catalog/event-catalog.js';
import { RuleModel } from './rule.model.js';

/**
 * Dry run: evaluates a rule against a payload and renders what *would* be sent,
 * with no event stored and no delivery queued.
 *
 * This is what makes the rule editor trustworthy - the author sees the exact
 * message and the per-condition outcome before enabling anything.
 */
export const testRule = async (
  ownerId: string,
  ruleId: string,
  payload: Record<string, unknown>,
): Promise<RuleTestResultDto> => {
  const rule = await RuleModel.findOne({ _id: ruleId, ownerId });
  if (!rule) throw AppError.notFound('Rule');

  const effectivePayload =
    Object.keys(payload).length > 0
      ? payload
      : ((findEventType(rule.eventType)?.samplePayload ?? {}) as Record<string, unknown>);

  const evaluation = evaluateGroup(rule.conditions, effectivePayload);

  const result: RuleTestResultDto = {
    matched: evaluation.matched,
    evaluations: evaluation.evaluations,
    preview: [],
  };

  if (!evaluation.matched) {
    return result;
  }

  const recipients = await resolveRecipients(rule.recipients);
  const ruleRef = { id: rule.id as string, name: rule.name };

  for (const recipient of recipients) {
    const context = buildTemplateContext(
      {
        eventId: 'dry-run',
        eventType: rule.eventType,
        source: 'preview',
        occurredAt: new Date(),
        payload: effectivePayload,
      },
      ruleRef,
      recipient,
    );

    for (const channel of rule.channels) {
      // Mirrors the fan-out rule in `rule-matcher`: a recipient with no account
      // has no inbox. Previewing a delivery the real run would skip would make
      // the dry run misleading.
      if (channel === 'IN_APP' && !recipient.userId) {
        continue;
      }

      result.preview.push({
        channel,
        recipient: recipient.value,
        subject: render(rule.template.subject, context).text,
        body: render(rule.template.body, context).text,
      });
    }
  }

  return result;
};
