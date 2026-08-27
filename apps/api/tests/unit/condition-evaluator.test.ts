import { describe, expect, it } from 'vitest';
import type { ConditionOperator } from '@cns/shared';
import { evaluateCondition, evaluateGroup } from '../../src/engine/condition-evaluator.js';
import { readPath } from '../../src/engine/path.js';

const payload = {
  order: {
    id: 'ORD-1',
    value: 15_000,
    currency: 'USD',
    itemCount: 7,
    region: 'NA',
    expedited: true,
    tags: ['priority', 'wholesale'],
    placedAt: '2026-08-27T09:15:00.000Z',
  },
  customer: { name: 'Acme Industries', tier: 'enterprise', email: 'ap@acme.example' },
};

const check = (field: string, operator: ConditionOperator, value?: unknown) =>
  evaluateCondition({ field, operator, value: value as never }, payload).passed;

describe('readPath', () => {
  it('reads nested values and array indices', () => {
    expect(readPath(payload, 'order.value')).toBe(15_000);
    expect(readPath(payload, 'order.tags.1')).toBe('wholesale');
  });

  it('returns undefined instead of throwing for missing or invalid paths', () => {
    expect(readPath(payload, 'order.missing.deep')).toBeUndefined();
    expect(readPath(payload, 'order.value.nope')).toBeUndefined();
    expect(readPath(payload, '')).toBeUndefined();
  });

  it('refuses to traverse prototype pollution paths', () => {
    expect(readPath(payload, '__proto__.polluted')).toBeUndefined();
    expect(readPath(payload, 'constructor.name')).toBeUndefined();
  });
});

describe('numeric operators', () => {
  it('covers the brief: order value over 10,000 matches', () => {
    expect(check('order.value', 'gt', 10_000)).toBe(true);
    expect(check('order.value', 'gt', 20_000)).toBe(false);
  });

  it.each([
    ['gte', 15_000, true],
    ['gte', 15_001, false],
    ['lt', 15_001, true],
    ['lte', 15_000, true],
    ['eq', 15_000, true],
    ['neq', 15_000, false],
  ] as const)('%s %d -> %s', (operator, value, expected) => {
    expect(check('order.value', operator, value)).toBe(expected);
  });

  it('coerces numeric strings so JSON quoting does not change the outcome', () => {
    expect(evaluateCondition({ field: 'v', operator: 'gt', value: 10_000 }, { v: '15000' }).passed).toBe(
      true,
    );
  });

  it('treats between as inclusive and tolerates reversed bounds', () => {
    expect(check('order.value', 'between', [10_000, 20_000])).toBe(true);
    expect(check('order.value', 'between', [20_000, 10_000])).toBe(true);
    expect(check('order.value', 'between', [15_000, 15_000])).toBe(true);
    expect(check('order.value', 'between', [1, 100])).toBe(false);
  });

  it('does not match when between is given a malformed range', () => {
    expect(check('order.value', 'between', [10_000])).toBe(false);
    expect(check('order.value', 'between', 10_000)).toBe(false);
  });
});

describe('string operators', () => {
  it('matches case insensitively', () => {
    expect(check('customer.tier', 'eq', 'ENTERPRISE')).toBe(true);
    expect(check('customer.name', 'contains', 'acme')).toBe(true);
    expect(check('customer.name', 'starts_with', 'Acme')).toBe(true);
    expect(check('customer.email', 'ends_with', '.example')).toBe(true);
    expect(check('customer.name', 'not_contains', 'globex')).toBe(true);
  });

  it('treats contains on an array as membership', () => {
    expect(check('order.tags', 'contains', 'priority')).toBe(true);
    expect(check('order.tags', 'contains', 'retail')).toBe(false);
  });
});

describe('list, boolean and presence operators', () => {
  it('handles in and not_in', () => {
    expect(check('order.region', 'in', ['NA', 'EMEA'])).toBe(true);
    expect(check('order.region', 'not_in', ['EMEA', 'APAC'])).toBe(true);
    expect(check('order.region', 'in', ['EMEA'])).toBe(false);
  });

  it('compares booleans by truthiness of both sides', () => {
    expect(check('order.expedited', 'eq', true)).toBe(true);
    expect(check('order.expedited', 'neq', false)).toBe(true);
  });

  it('treats null, undefined and empty string as absent', () => {
    expect(check('order.id', 'exists')).toBe(true);
    expect(check('order.nothing', 'exists')).toBe(false);
    expect(check('order.nothing', 'not_exists')).toBe(true);
    expect(evaluateCondition({ field: 'v', operator: 'exists' }, { v: '' }).passed).toBe(false);
  });
});

describe('evaluateGroup', () => {
  const gt10k = { field: 'order.value', operator: 'gt' as const, value: 10_000 };
  const isApac = { field: 'order.region', operator: 'eq' as const, value: 'APAC' };

  it('requires every condition under AND', () => {
    expect(evaluateGroup({ logic: 'AND', items: [gt10k, isApac] }, payload).matched).toBe(false);
    expect(evaluateGroup({ logic: 'AND', items: [gt10k] }, payload).matched).toBe(true);
  });

  it('requires one condition under OR', () => {
    expect(evaluateGroup({ logic: 'OR', items: [gt10k, isApac] }, payload).matched).toBe(true);
    expect(evaluateGroup({ logic: 'OR', items: [isApac] }, payload).matched).toBe(false);
  });

  it('matches every event when no conditions are configured', () => {
    expect(evaluateGroup({ logic: 'AND', items: [] }, payload).matched).toBe(true);
  });

  it('reports each condition so the editor can show which one failed', () => {
    const result = evaluateGroup({ logic: 'AND', items: [gt10k, isApac] }, payload);

    expect(result.evaluations).toHaveLength(2);
    expect(result.evaluations[0]).toMatchObject({ passed: true, actual: 15_000 });
    expect(result.evaluations[1]).toMatchObject({ passed: false, actual: 'NA', expected: 'APAC' });
  });

  it('does not throw when a rule references a field the event lacks', () => {
    const result = evaluateGroup(
      { logic: 'AND', items: [{ field: 'not.here', operator: 'gt', value: 5 }] },
      payload,
    );
    expect(result.matched).toBe(false);
  });
});
