import type { NotificationChannel } from '@cns/shared';
import { env } from '../config/env.js';
import { createLogger } from '../common/logger.js';
import { DeliveryModel } from '../modules/deliveries/delivery.model.js';
import { findMatchableRules } from '../modules/rules/rule.service.js';
import type { RuleDocument } from '../modules/rules/rule.model.js';
import { evaluateGroup, type GroupEvaluation } from './condition-evaluator.js';
import { buildDedupeKey } from './dedupe.js';
import { resolveRecipients, type ResolvedRecipient } from './recipient-resolver.js';
import { render } from './template-renderer.js';

const log = createLogger('engine');

export interface MatchedRule {
  rule: RuleDocument;
  evaluation: GroupEvaluation;
}

export interface FanOutInput {
  eventId: string;
  eventType: string;
  source: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface FanOutResult {
  matchedRules: Array<{ id: string; name: string }>;
  created: number;
  suppressed: number;
}

/** Evaluates every enabled rule for this event type against the payload. */
export const matchRules = async (
  eventType: string,
  payload: Record<string, unknown>,
): Promise<MatchedRule[]> => {
  const candidates = await findMatchableRules(eventType);

  return candidates
    .map((rule) => ({ rule, evaluation: evaluateGroup(rule.conditions, payload) }))
    .filter((candidate) => candidate.evaluation.matched);
};

/** Context every template is rendered against. */
export const buildTemplateContext = (
  input: FanOutInput,
  rule: { id: string; name: string },
  recipient: ResolvedRecipient,
): Record<string, unknown> => ({
  // Payload fields are addressable at the root (`order.value`) as well as
  // namespaced (`payload.order.value`).
  ...input.payload,
  payload: input.payload,
  event: {
    id: input.eventId,
    type: input.eventType,
    source: input.source,
    occurredAt: input.occurredAt.toISOString(),
  },
  rule,
  recipient: {
    type: recipient.type,
    value: recipient.value,
    name: recipient.displayName ?? recipient.value,
  },
});

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: number }).code === 11000;

/**
 * Turns matched rules into pending delivery rows - one per (rule, channel,
 * recipient).
 *
 * Nothing is sent here. The HTTP caller only pays for the writes, and the
 * worker owns every interaction with a flaky provider. Duplicate suppression is
 * delegated to the unique index on `dedupeKey`: we attempt the insert and treat
 * a key collision as an expected outcome rather than checking first, which
 * keeps the operation safe under concurrent ingestion of the same event.
 */
export const fanOutToDeliveries = async (
  input: FanOutInput,
  matches: MatchedRule[],
): Promise<FanOutResult> => {
  let created = 0;
  let suppressed = 0;
  const now = new Date();

  for (const { rule } of matches) {
    const recipients = await resolveRecipients(rule.recipients);

    if (recipients.length === 0) {
      log.warn({ ruleId: rule.id }, 'Rule matched but resolved to no recipients');
      continue;
    }

    const ruleRef = { id: rule.id as string, name: rule.name };

    for (const recipient of recipients) {
      const context = buildTemplateContext(input, ruleRef, recipient);
      const subject = render(rule.template.subject, context).text;
      const body = render(rule.template.body, context).text;

      for (const channel of rule.channels as NotificationChannel[]) {
        // An in-app notification needs an inbox to land in. Queueing one for a
        // plain email recipient would only ever dead-letter, so skip it here
        // rather than spend a delivery row and a worker cycle on it.
        if (channel === 'IN_APP' && !recipient.userId) {
          log.debug(
            { ruleId: ruleRef.id, recipient: recipient.value },
            'Skipping in-app delivery for a recipient with no account',
          );
          continue;
        }

        const dedupeKey = buildDedupeKey({
          ruleId: ruleRef.id,
          channel,
          recipient: recipient.value,
          eventId: input.eventId,
          dedupeWindowSec: rule.dedupeWindowSec,
          now,
        });

        try {
          await DeliveryModel.create({
            eventId: input.eventId,
            eventType: input.eventType,
            ruleId: rule._id,
            ruleName: rule.name,
            ownerId: rule.ownerId,
            channel,
            recipient: {
              type: recipient.type,
              value: recipient.value,
              userId: recipient.userId ?? null,
            },
            subject,
            body,
            status: 'PENDING',
            attempts: 0,
            maxAttempts: env.DELIVERY_MAX_ATTEMPTS,
            nextAttemptAt: now,
            dedupeKey,
          });
          created += 1;
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            suppressed += 1;
            log.debug({ ruleId: ruleRef.id, channel, dedupeKey }, 'Duplicate delivery suppressed');
            continue;
          }
          throw error;
        }
      }
    }
  }

  return {
    matchedRules: matches.map(({ rule }) => ({ id: rule.id as string, name: rule.name })),
    created,
    suppressed,
  };
};
