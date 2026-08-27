import type { ConditionLogic, ConditionOperator, ConditionValue } from '@cns/shared';
import { readPath } from './path.js';

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value?: ConditionValue;
}

export interface ConditionGroup {
  logic: ConditionLogic;
  items: Condition[];
}

export interface ConditionEvaluation {
  field: string;
  operator: ConditionOperator;
  expected?: ConditionValue;
  actual: unknown;
  passed: boolean;
}

export interface GroupEvaluation {
  matched: boolean;
  evaluations: ConditionEvaluation[];
}

/**
 * Coerces both sides to comparable numbers when that is unambiguous.
 * `"15000"` from a JSON payload must still satisfy `> 10000`.
 */
const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    const asDate = Date.parse(value);
    return Number.isNaN(asDate) ? undefined : asDate;
  }
  return undefined;
};

const asString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return undefined;
};

/** Loose equality across the JSON scalar types, without `==` surprises. */
const looseEquals = (actual: unknown, expected: unknown): boolean => {
  if (actual === expected) return true;

  if (typeof expected === 'boolean' || typeof actual === 'boolean') {
    return Boolean(actual) === Boolean(expected);
  }

  const [left, right] = [asNumber(actual), asNumber(expected)];
  if (left !== undefined && right !== undefined) return left === right;

  const [leftText, rightText] = [asString(actual), asString(expected)];
  if (leftText !== undefined && rightText !== undefined) {
    return leftText.toLowerCase() === rightText.toLowerCase();
  }

  return false;
};

const compare = (
  actual: unknown,
  expected: unknown,
  predicate: (a: number, b: number) => boolean,
): boolean => {
  const [left, right] = [asNumber(actual), asNumber(expected)];
  if (left !== undefined && right !== undefined) return predicate(left, right);

  const [leftText, rightText] = [asString(actual), asString(expected)];
  if (leftText !== undefined && rightText !== undefined) {
    return predicate(leftText.localeCompare(rightText), 0);
  }

  return false;
};

const textOf = (value: unknown): string => (asString(value) ?? '').toLowerCase();

const toList = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

const isPresent = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '';

/**
 * One entry per operator. Adding an operator means adding a key here and to
 * `CONDITION_OPERATORS` in the shared package - the exhaustive `Record` makes
 * the compiler enforce that the two stay aligned.
 */
const OPERATORS: Record<
  ConditionOperator,
  (actual: unknown, expected: ConditionValue | undefined) => boolean
> = {
  eq: (actual, expected) => looseEquals(actual, expected),
  neq: (actual, expected) => !looseEquals(actual, expected),
  gt: (actual, expected) => compare(actual, expected, (a, b) => a > b),
  gte: (actual, expected) => compare(actual, expected, (a, b) => a >= b),
  lt: (actual, expected) => compare(actual, expected, (a, b) => a < b),
  lte: (actual, expected) => compare(actual, expected, (a, b) => a <= b),
  between: (actual, expected) => {
    if (!Array.isArray(expected) || expected.length !== 2) return false;
    const [from, to] = expected;
    // Inclusive on both ends, and tolerant of the bounds arriving reversed.
    return (
      (compare(actual, from, (a, b) => a >= b) && compare(actual, to, (a, b) => a <= b)) ||
      (compare(actual, to, (a, b) => a >= b) && compare(actual, from, (a, b) => a <= b))
    );
  },
  contains: (actual, expected) =>
    Array.isArray(actual)
      ? actual.some((item) => looseEquals(item, expected))
      : textOf(actual).includes(textOf(expected)),
  not_contains: (actual, expected) => !OPERATORS.contains(actual, expected),
  starts_with: (actual, expected) => textOf(actual).startsWith(textOf(expected)),
  ends_with: (actual, expected) => textOf(actual).endsWith(textOf(expected)),
  in: (actual, expected) => toList(expected).some((item) => looseEquals(actual, item)),
  not_in: (actual, expected) => !OPERATORS.in(actual, expected),
  exists: (actual) => isPresent(actual),
  not_exists: (actual) => !isPresent(actual),
};

/** Evaluates a single condition against an event payload. */
export const evaluateCondition = (condition: Condition, payload: unknown): ConditionEvaluation => {
  const actual = readPath(payload, condition.field);
  const predicate = OPERATORS[condition.operator];

  return {
    field: condition.field,
    operator: condition.operator,
    ...(condition.value === undefined ? {} : { expected: condition.value }),
    actual,
    // An unknown operator can only arrive from data written before a downgrade;
    // treat it as a non-match rather than crashing the ingest path.
    passed: predicate ? predicate(actual, condition.value) : false,
  };
};

/**
 * Evaluates a whole group. An empty group matches, which is what makes
 * "notify me on every order" expressible without a dummy condition.
 */
export const evaluateGroup = (group: ConditionGroup, payload: unknown): GroupEvaluation => {
  const evaluations = group.items.map((item) => evaluateCondition(item, payload));

  if (evaluations.length === 0) {
    return { matched: true, evaluations };
  }

  const matched =
    group.logic === 'OR'
      ? evaluations.some((evaluation) => evaluation.passed)
      : evaluations.every((evaluation) => evaluation.passed);

  return { matched, evaluations };
};
