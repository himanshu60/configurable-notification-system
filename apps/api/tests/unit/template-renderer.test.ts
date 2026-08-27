import { describe, expect, it } from 'vitest';
import { render } from '../../src/engine/template-renderer.js';

const context = {
  order: { id: 'ORD-1', value: 15_000, placedAt: '2026-08-27T09:15:00.000Z' },
  customer: { name: 'Acme Industries', tier: 'enterprise' },
  recipient: { name: 'Dana' },
};

describe('render', () => {
  it('substitutes plain tokens', () => {
    expect(render('Order {{order.id}} for {{customer.name}}', context).text).toBe(
      'Order ORD-1 for Acme Industries',
    );
  });

  it('applies the currency formatter, which is the example from the brief', () => {
    expect(render('{{order.value | currency}}', context).text).toBe('$15,000.00');
  });

  it.each([
    ['{{order.value | number}}', '15,000'],
    ['{{order.placedAt | date}}', '2026-08-27'],
    ['{{customer.tier | upper}}', 'ENTERPRISE'],
    ['{{customer.name | lower}}', 'acme industries'],
  ])('%s renders as %s', (template, expected) => {
    expect(render(template, context).text).toBe(expected);
  });

  it('tolerates whitespace inside the token', () => {
    expect(render('{{  order.id  }}', context).text).toBe('ORD-1');
  });

  it('renders an unknown path as empty and reports it', () => {
    const result = render('Hi {{customer.nickname}}!', context);

    expect(result.text).toBe('Hi !');
    expect(result.missing).toEqual(['customer.nickname']);
  });

  it('leaves text that only looks like a token alone', () => {
    expect(render('Use {{ }} or { order.id } literally', context).text).toBe(
      'Use {{ }} or { order.id } literally',
    );
  });

  it('does not evaluate expressions embedded in a template', () => {
    const result = render('{{constructor.constructor}}', context);

    expect(result.text).toBe('');
    expect(result.missing).toEqual(['constructor.constructor']);
  });

  it('falls back to the raw value when a formatter cannot apply', () => {
    expect(render('{{customer.name | currency}}', context).text).toBe('Acme Industries');
  });
});
