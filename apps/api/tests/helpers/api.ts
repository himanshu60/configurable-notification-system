import request from 'supertest';
import type { Express } from 'express';
import type { AuthResultDto, CreateRuleInput } from '@cns/shared';
import { createApp } from '../../src/app.js';

export const app: Express = createApp();

export const api = () => request(app);

export const registerUser = async (
  overrides: Partial<{ name: string; email: string; password: string }> = {},
): Promise<AuthResultDto> => {
  const body = {
    name: overrides.name ?? 'Dana Ops',
    email: overrides.email ?? `dana-${Math.random().toString(36).slice(2, 10)}@example.com`,
    password: overrides.password ?? 'Password123!',
  };

  const response = await api().post('/api/v1/auth/register').send(body).expect(201);
  return response.body.data as AuthResultDto;
};

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A valid rule matching the example from the brief, with fields overridable. */
export const ruleFixture = (overrides: Partial<CreateRuleInput> = {}): CreateRuleInput =>
  ({
    name: `High value orders ${Math.random().toString(36).slice(2, 8)}`,
    description: 'Notify me when order value is over $10,000',
    eventType: 'order.created',
    enabled: true,
    priority: 10,
    conditions: { logic: 'AND', items: [{ field: 'order.value', operator: 'gt', value: 10_000 }] },
    recipients: [{ type: 'EMAIL', value: 'finance@example.com' }],
    channels: ['EMAIL'],
    template: {
      subject: 'Order {{order.id}} is {{order.value | currency}}',
      body: 'Order {{order.id}} came in at {{order.value | currency}}.',
    },
    dedupeWindowSec: 0,
    ...overrides,
  }) as CreateRuleInput;

export const orderPayload = (value = 15_000) => ({
  order: {
    id: 'ORD-1',
    value,
    currency: 'USD',
    itemCount: 3,
    region: 'NA',
    expedited: true,
    placedAt: '2026-08-27T09:00:00.000Z',
  },
  customer: { id: 'C1', name: 'Acme', email: 'ap@acme.example', tier: 'enterprise' },
});
