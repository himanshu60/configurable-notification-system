import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, auth, registerUser, ruleFixture } from '../helpers/api.js';
import { clearDatabase, startTestDatabase, stopTestDatabase } from '../helpers/database.js';

let token: string;

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);

beforeEach(async () => {
  await clearDatabase();
  token = (await registerUser()).token;
});

describe('authentication', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await api().get('/api/v1/rules').expect(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a malformed token', async () => {
    await api().get('/api/v1/rules').set(auth('not-a-real-token')).expect(401);
  });

  it('refuses to register the same email twice', async () => {
    const email = 'duplicate@example.com';
    await registerUser({ email });

    const response = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Someone', email, password: 'Password123!' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('gives the same message for a wrong password and an unknown account', async () => {
    const known = await registerUser({ email: 'known@example.com' });

    const [wrongPassword, unknownUser] = await Promise.all([
      api()
        .post('/api/v1/auth/login')
        .send({ email: known.user.email, password: 'WrongPassword1!' })
        .expect(401),
      api()
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'WrongPassword1!' })
        .expect(401),
    ]);

    expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
  });
});

describe('rule validation', () => {
  it('reports every invalid field at once with its path', async () => {
    const response = await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send({ name: 'x', eventType: 'order.created', recipients: [], channels: [] })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');

    const paths = response.body.error.details.map((issue: { path: string }) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'recipients', 'channels', 'template']));
  });

  it('rejects an unknown trigger and lists the supported ones', async () => {
    const response = await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(ruleFixture({ eventType: 'order.exploded' }))
      .expect(422);

    expect(response.body.error.details[0].message).toContain('order.created');
  });

  it('rejects a condition on a field the trigger does not have', async () => {
    const response = await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(
        ruleFixture({
          conditions: { logic: 'AND', items: [{ field: 'order.nonsense', operator: 'gt', value: 1 }] },
        }),
      )
      .expect(422);

    expect(response.body.error.details[0].path).toBe('conditions.items.0.field');
  });

  it('rejects an operator that does not suit the field type', async () => {
    const response = await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(
        ruleFixture({
          conditions: {
            logic: 'AND',
            items: [{ field: 'order.expedited', operator: 'contains', value: 'yes' }],
          },
        }),
      )
      .expect(422);

    expect(response.body.error.details[0].path).toBe('conditions.items.0.operator');
  });

  it('rejects a template token that no field backs', async () => {
    const response = await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(
        ruleFixture({
          template: { subject: 'Hi', body: 'Value {{order.imaginary}}' },
        }),
      )
      .expect(422);

    expect(response.body.error.details[0].path).toBe('template');
  });

  it('requires a value for a binary operator but not for a unary one', async () => {
    await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(
        ruleFixture({
          conditions: { logic: 'AND', items: [{ field: 'order.value', operator: 'gt' }] },
        }),
      )
      .expect(422);

    await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(
        ruleFixture({
          conditions: { logic: 'AND', items: [{ field: 'order.value', operator: 'exists' }] },
        }),
      )
      .expect(201);
  });

  it('rejects an invalid email recipient', async () => {
    const response = await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(ruleFixture({ recipients: [{ type: 'EMAIL', value: 'not-an-email' }] }))
      .expect(422);

    expect(response.body.error.details[0].path).toBe('recipients.0.value');
  });
});

describe('rule crud', () => {
  it('creates, reads, updates, toggles and deletes a rule', async () => {
    const created = await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(ruleFixture({ name: 'High value orders' }))
      .expect(201);

    const id = created.body.data.id;
    expect(created.body.data.enabled).toBe(true);

    await api().get(`/api/v1/rules/${id}`).set(auth(token)).expect(200);

    const updated = await api()
      .patch(`/api/v1/rules/${id}`)
      .set(auth(token))
      .send({ description: 'Updated copy' })
      .expect(200);
    expect(updated.body.data.description).toBe('Updated copy');

    const toggled = await api()
      .patch(`/api/v1/rules/${id}/enabled`)
      .set(auth(token))
      .send({ enabled: false })
      .expect(200);
    expect(toggled.body.data.enabled).toBe(false);

    await api().delete(`/api/v1/rules/${id}`).set(auth(token)).expect(204);
    await api().get(`/api/v1/rules/${id}`).set(auth(token)).expect(404);
  });

  it('refuses two rules with the same name for one owner', async () => {
    const rule = ruleFixture({ name: 'Duplicate name' });
    await api().post('/api/v1/rules').set(auth(token)).send(rule).expect(201);
    await api().post('/api/v1/rules').set(auth(token)).send(rule).expect(409);
  });

  it('re-validates the stored conditions when only the trigger changes', async () => {
    const created = await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(ruleFixture())
      .expect(201);

    // order.value does not exist on ticket.created, so the patch must fail.
    await api()
      .patch(`/api/v1/rules/${created.body.data.id}`)
      .set(auth(token))
      .send({ eventType: 'ticket.created' })
      .expect(422);
  });

  it('does not expose another user\'s rule', async () => {
    const mine = await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(ruleFixture())
      .expect(201);

    const other = await registerUser({ email: 'other@example.com' });

    await api().get(`/api/v1/rules/${mine.body.data.id}`).set(auth(other.token)).expect(404);
    await api().delete(`/api/v1/rules/${mine.body.data.id}`).set(auth(other.token)).expect(404);
  });

  it('filters and paginates the list', async () => {
    await api().post('/api/v1/rules').set(auth(token)).send(ruleFixture({ name: 'Alpha orders' }));
    await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(ruleFixture({ name: 'Beta tickets', eventType: 'ticket.created', conditions: { logic: 'AND', items: [] }, template: { subject: 'T', body: '{{ticket.id}}' } }));

    const search = await api().get('/api/v1/rules?search=alpha').set(auth(token)).expect(200);
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].name).toBe('Alpha orders');

    const byType = await api()
      .get('/api/v1/rules?eventType=ticket.created')
      .set(auth(token))
      .expect(200);
    expect(byType.body.data).toHaveLength(1);

    const paged = await api().get('/api/v1/rules?page=1&limit=1').set(auth(token)).expect(200);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2, hasNext: true });
  });
});

describe('rule dry run', () => {
  it('reports a match with the rendered message and no side effects', async () => {
    const created = await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(ruleFixture())
      .expect(201);

    const response = await api()
      .post(`/api/v1/rules/${created.body.data.id}/test`)
      .set(auth(token))
      .send({ payload: { order: { id: 'ORD-9', value: 15_000 } } })
      .expect(200);

    expect(response.body.data.matched).toBe(true);
    expect(response.body.data.preview[0].subject).toBe('Order ORD-9 is $15,000.00');

    // Nothing was queued.
    const history = await api().get('/api/v1/notifications').set(auth(token)).expect(200);
    expect(history.body.data).toHaveLength(0);
  });

  it('explains which condition failed when the rule does not match', async () => {
    const created = await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(ruleFixture())
      .expect(201);

    const response = await api()
      .post(`/api/v1/rules/${created.body.data.id}/test`)
      .set(auth(token))
      .send({ payload: { order: { id: 'ORD-9', value: 500 } } })
      .expect(200);

    expect(response.body.data.matched).toBe(false);
    expect(response.body.data.evaluations[0]).toMatchObject({ passed: false, actual: 500 });
    expect(response.body.data.preview).toHaveLength(0);
  });
});

describe('dry run and the real run agree', () => {
  it('does not preview an in-app delivery the fan-out would skip', async () => {
    const created = await api()
      .post('/api/v1/rules')
      .set(auth(token))
      .send(
        ruleFixture({
          recipients: [{ type: 'EMAIL', value: 'stranger@example.com' }],
          channels: ['EMAIL', 'IN_APP'],
        }),
      )
      .expect(201);

    const response = await api()
      .post(`/api/v1/rules/${created.body.data.id}/test`)
      .set(auth(token))
      .send({ payload: { order: { id: 'ORD-1', value: 15_000 } } })
      .expect(200);

    expect(response.body.data.matched).toBe(true);
    expect(response.body.data.preview).toHaveLength(1);
    expect(response.body.data.preview[0].channel).toBe('EMAIL');
  });
});
