import type { QueryFilter } from 'mongoose';
import type {
  CreateRuleInput,
  PaginationMeta,
  RuleDto,
  RuleQuery,
  UpdateRuleInput,
} from '@cns/shared';
import { AppError } from '../../common/app-error.js';
import { buildPaginationMeta } from '../../common/http.js';
import { RuleModel, toRuleDto, type RuleAttributes } from './rule.model.js';
import { assertRuleIsCoherent } from './rule.validation.js';

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildFilter = (ownerId: string, query: RuleQuery): QueryFilter<RuleAttributes> => {
  const filter: QueryFilter<RuleAttributes> = { ownerId };

  if (query.eventType) filter['eventType'] = query.eventType;
  if (query.channel) filter['channels'] = query.channel;
  if (query.enabled) filter['enabled'] = query.enabled === 'true';
  if (query.search) {
    // Regex rather than $text so partial words match while the user is typing.
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter['$or'] = [{ name: pattern }, { description: pattern }];
  }

  return filter;
};

export const listRules = async (
  ownerId: string,
  query: RuleQuery,
): Promise<{ rules: RuleDto[]; meta: PaginationMeta }> => {
  const filter = buildFilter(ownerId, query);
  const sort = { [query.sortBy]: query.sortOrder === 'asc' ? 1 : -1 } as Record<string, 1 | -1>;

  const [documents, total] = await Promise.all([
    RuleModel.find(filter)
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    RuleModel.countDocuments(filter),
  ]);

  return {
    rules: documents.map(toRuleDto),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

const findOwnedRule = async (ownerId: string, ruleId: string) => {
  const rule = await RuleModel.findOne({ _id: ruleId, ownerId });
  if (!rule) {
    // 404 rather than 403 so the API does not confirm that someone else's rule
    // exists at this id.
    throw AppError.notFound('Rule');
  }
  return rule;
};

export const getRule = async (ownerId: string, ruleId: string): Promise<RuleDto> =>
  toRuleDto(await findOwnedRule(ownerId, ruleId));

export const createRule = async (ownerId: string, input: CreateRuleInput): Promise<RuleDto> => {
  assertRuleIsCoherent(input);

  const duplicate = await RuleModel.exists({ ownerId, name: input.name });
  if (duplicate) {
    throw AppError.conflict(`You already have a rule named "${input.name}"`);
  }

  const rule = await RuleModel.create({ ...input, ownerId });
  return toRuleDto(rule);
};

export const updateRule = async (
  ownerId: string,
  ruleId: string,
  input: UpdateRuleInput,
): Promise<RuleDto> => {
  const rule = await findOwnedRule(ownerId, ruleId);

  // Validate the merged result, not the patch, so changing only the trigger
  // still re-checks the conditions that were already stored.
  assertRuleIsCoherent({
    eventType: input.eventType ?? rule.eventType,
    conditions: input.conditions ?? rule.conditions,
    template: input.template ?? rule.template,
  });

  if (input.name && input.name !== rule.name) {
    const duplicate = await RuleModel.exists({ ownerId, name: input.name, _id: { $ne: ruleId } });
    if (duplicate) {
      throw AppError.conflict(`You already have a rule named "${input.name}"`);
    }
  }

  rule.set(input);
  await rule.save();

  return toRuleDto(rule);
};

export const setRuleEnabled = async (
  ownerId: string,
  ruleId: string,
  enabled: boolean,
): Promise<RuleDto> => {
  const rule = await findOwnedRule(ownerId, ruleId);
  rule.enabled = enabled;
  await rule.save();
  return toRuleDto(rule);
};

export const deleteRule = async (ownerId: string, ruleId: string): Promise<void> => {
  const result = await RuleModel.deleteOne({ _id: ruleId, ownerId });
  if (result.deletedCount === 0) {
    throw AppError.notFound('Rule');
  }
};

/** Rules the matcher should consider for an event, cheapest filter first. */
export const findMatchableRules = (eventType: string) =>
  RuleModel.find({ eventType, enabled: true }).sort({ priority: 1, createdAt: 1 });
