import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeliveryModel } from '../../src/modules/deliveries/delivery.model.js';
import { runDispatchCycle, claimNextDelivery } from '../../src/worker/dispatcher.js';
import { mockEmailConfig } from '../../src/channels/email.channel.js';
import { api, auth, orderPayload, registerUser, ruleFixture } from '../helpers/api.js';
import { clearDatabase, startTestDatabase, stopTestDatabase } from '../helpers/database.js';

let token: string;
let userId: string;

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);

beforeEach(async () => {
  await clearDatabase();
  const account = await registerUser();
  token = account.token;
  userId = account.user.id;
});

const createRule = async (overrides = {}) => {
  const response = await api()
    .post('/api/v1/rules')
    .set(auth(token))
    .send(ruleFixture(overrides))
    .expect(201);
  return response.body.data;
};

const ingest = (body: Record<string, unknown>) =>
  api().post('/api/v1/events').set(auth(token)).send(body);

describe('event ingestion', () => {
  it('generates a notification for the example in the brief', async () => {
    await createRule();

    const response = await ingest({
      eventId: 'evt-0001',
      type: 'order.created',
      payload: orderPayload(15_000),
    }).expect(201);

    expect(response.body.data.duplicate).toBe(false);
    expect(response.body.data.matchedRules[0].name).toContain('High value orders');
    expect(response.body.data.deliveriesCreated).toBe(1);
  });

  it('does not generate one when the condition is not met', async () => {
    await createRule();

    const response = await ingest({
      eventId: 'evt-0002',
      type: 'order.created',
      payload: orderPayload(500),
    }).expect(201);

    expect(response.body.data.matchedRules).toHaveLength(0);
    expect(response.body.data.deliveriesCreated).toBe(0);
  });

  it('ignores a disabled rule', async () => {
    const rule = await createRule();
    await api()
      .patch(`/api/v1/rules/${rule.id}/enabled`)
      .set(auth(token))
      .send({ enabled: false })
      .expect(200);

    const response = await ingest({
      eventId: 'evt-0003',
      type: 'order.created',
      payload: orderPayload(15_000),
    }).expect(201);

    expect(response.body.data.deliveriesCreated).toBe(0);
  });

  it('rejects an unknown event type', async () => {
    await ingest({ eventId: 'evt-0004', type: 'order.exploded', payload: {} }).expect(422);
  });

  it('fans out to every channel and recipient combination', async () => {
    await createRule({
      recipients: [
        { type: 'EMAIL', value: 'finance@example.com' },
        { type: 'USER', value: userId },
      ],
      channels: ['EMAIL', 'IN_APP'],
    });

    const response = await ingest({
      eventId: 'evt-0005',
      type: 'order.created',
      payload: orderPayload(15_000),
    }).expect(201);

    // 2 recipients x 2 channels, minus the in-app row for the recipient who has
    // no account and therefore no inbox.
    expect(response.body.data.deliveriesCreated).toBe(3);
  });
});

describe('duplicate events', () => {
  it('accepts the same eventId twice without notifying twice', async () => {
    await createRule();
    const event = { eventId: 'evt-dup', type: 'order.created', payload: orderPayload(15_000) };

    const first = await ingest(event).expect(201);
    const second = await ingest(event).expect(200);

    expect(first.body.data.duplicate).toBe(false);
    expect(second.body.data.duplicate).toBe(true);
    expect(second.body.data.deliveriesCreated).toBe(0);
    expect(await DeliveryModel.countDocuments({})).toBe(1);
  });

  it('is safe when the same event arrives concurrently', async () => {
    await createRule();
    const event = { eventId: 'evt-race', type: 'order.created', payload: orderPayload(15_000) };

    const responses = await Promise.all([ingest(event), ingest(event), ingest(event)]);

    expect(responses.filter((r) => r.body.data.duplicate === false)).toHaveLength(1);
    expect(await DeliveryModel.countDocuments({})).toBe(1);
  });

  it('accepts the Idempotency-Key header in place of an eventId', async () => {
    await createRule();
    const body = { type: 'order.created', payload: orderPayload(15_000) };

    await api()
      .post('/api/v1/events')
      .set(auth(token))
      .set('Idempotency-Key', 'header-key-1')
      .send(body)
      .expect(201);

    const second = await api()
      .post('/api/v1/events')
      .set(auth(token))
      .set('Idempotency-Key', 'header-key-1')
      .send(body)
      .expect(200);

    expect(second.body.data.duplicate).toBe(true);
  });

  it('collapses distinct events inside a rule dedupe window', async () => {
    await createRule({ dedupeWindowSec: 300 });

    const first = await ingest({
      eventId: 'evt-w1',
      type: 'order.created',
      payload: orderPayload(15_000),
    }).expect(201);
    const second = await ingest({
      eventId: 'evt-w2',
      type: 'order.created',
      payload: orderPayload(16_000),
    }).expect(201);

    expect(first.body.data.deliveriesCreated).toBe(1);
    expect(second.body.data.deliveriesCreated).toBe(0);
    expect(second.body.data.deliveriesSuppressed).toBe(1);
  });
});

describe('the delivery worker', () => {
  beforeEach(async () => {
    mockEmailConfig.failureRate = 0;
  });

  const queueOne = async () => {
    await createRule();
    await ingest({
      eventId: `evt-${Math.random().toString(36).slice(2)}`,
      type: 'order.created',
      payload: orderPayload(15_000),
    }).expect(201);

    const delivery = await DeliveryModel.findOne({});
    if (!delivery) throw new Error('expected a queued delivery');
    return delivery;
  };

  it('sends a pending delivery and records the provider id', async () => {
    const queued = await queueOne();
    expect(queued.status).toBe('PENDING');

    expect(await runDispatchCycle('worker-test')).toBe(1);

    const sent = await DeliveryModel.findById(queued.id);
    expect(sent?.status).toBe('SENT');
    expect(sent?.attempts).toBe(1);
    expect(sent?.providerMessageId).toMatch(/^smtp-/);
    expect(sent?.lockedBy).toBeNull();
  });

  it('retries with backoff when the provider fails, then succeeds', async () => {
    const queued = await queueOne();

    mockEmailConfig.failureRate = 1;
    await runDispatchCycle('worker-test');

    const failed = await DeliveryModel.findById(queued.id);
    expect(failed?.status).toBe('FAILED');
    expect(failed?.attempts).toBe(1);
    expect(failed?.lastError).toContain('SMTP');
    expect(failed?.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now());

    // The retry is not due yet, so a cycle right now must do nothing.
    expect(await runDispatchCycle('worker-test')).toBe(0);

    mockEmailConfig.failureRate = 0;
    await DeliveryModel.updateOne({ _id: queued.id }, { $set: { nextAttemptAt: new Date() } });
    await runDispatchCycle('worker-test');

    const sent = await DeliveryModel.findById(queued.id);
    expect(sent?.status).toBe('SENT');
    expect(sent?.attempts).toBe(2);
  });

  it('dead-letters once the attempt budget is exhausted', async () => {
    const queued = await queueOne();
    mockEmailConfig.failureRate = 1;

    for (let attempt = 0; attempt < queued.maxAttempts; attempt += 1) {
      await DeliveryModel.updateOne({ _id: queued.id }, { $set: { nextAttemptAt: new Date() } });
      await runDispatchCycle('worker-test');
    }

    const dead = await DeliveryModel.findById(queued.id);
    expect(dead?.status).toBe('DEAD_LETTER');
    expect(dead?.attempts).toBe(queued.maxAttempts);
  });

  it('dead-letters a permanent failure immediately without burning retries', async () => {
    await createRule({ recipients: [{ type: 'EMAIL', value: 'finance@example.com' }] });
    await ingest({ eventId: 'evt-bad', type: 'order.created', payload: orderPayload(15_000) });

    // Corrupt the address the way a real bad record would be.
    await DeliveryModel.updateOne({}, { $set: { 'recipient.value': 'not-an-address' } });
    await runDispatchCycle('worker-test');

    const dead = await DeliveryModel.findOne({});
    expect(dead?.status).toBe('DEAD_LETTER');
    expect(dead?.attempts).toBe(1);
  });

  it('never lets two workers claim the same delivery', async () => {
    await createRule();
    await ingest({ eventId: 'evt-claim', type: 'order.created', payload: orderPayload(15_000) });

    const claims = await Promise.all([
      claimNextDelivery('worker-a'),
      claimNextDelivery('worker-b'),
      claimNextDelivery('worker-c'),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('reclaims a delivery whose worker died mid-attempt', async () => {
    const queued = await queueOne();

    // Simulate a crash: locked long ago, still PROCESSING.
    await DeliveryModel.updateOne(
      { _id: queued.id },
      { $set: { status: 'PROCESSING', lockedAt: new Date(Date.now() - 600_000), lockedBy: 'dead' } },
    );

    await runDispatchCycle('worker-test');

    const recovered = await DeliveryModel.findById(queued.id);
    expect(recovered?.status).toBe('SENT');
  });
});

describe('notification history and inbox', () => {
  it('lists history with the fields the brief asks for and filters them', async () => {
    await createRule({
      recipients: [{ type: 'USER', value: userId }],
      channels: ['EMAIL', 'IN_APP'],
    });
    await ingest({ eventId: 'evt-hist', type: 'order.created', payload: orderPayload(15_000) });
    await runDispatchCycle('worker-test');

    const history = await api().get('/api/v1/notifications').set(auth(token)).expect(200);

    expect(history.body.data).toHaveLength(2);
    expect(history.body.data[0]).toMatchObject({
      status: 'SENT',
      ruleName: expect.any(String),
      channel: expect.any(String),
    });
    expect(history.body.data[0].recipient.value).toBeDefined();
    expect(history.body.data[0].createdAt).toBeDefined();

    const emailOnly = await api()
      .get('/api/v1/notifications?channel=EMAIL')
      .set(auth(token))
      .expect(200);
    expect(emailOnly.body.data).toHaveLength(1);
  });

  it('shows in-app notifications in the inbox and marks them read', async () => {
    await createRule({ recipients: [{ type: 'USER', value: userId }], channels: ['IN_APP'] });
    await ingest({ eventId: 'evt-inbox', type: 'order.created', payload: orderPayload(15_000) });
    await runDispatchCycle('worker-test');

    const inbox = await api().get('/api/v1/notifications/inbox').set(auth(token)).expect(200);
    expect(inbox.body.unreadCount).toBe(1);

    await api()
      .patch(`/api/v1/notifications/${inbox.body.data[0].id}/read`)
      .set(auth(token))
      .expect(200);

    const after = await api().get('/api/v1/notifications/inbox').set(auth(token)).expect(200);
    expect(after.body.unreadCount).toBe(0);
  });

  it('requeues a dead-lettered notification on retry', async () => {
    await createRule();
    await ingest({ eventId: 'evt-retry', type: 'order.created', payload: orderPayload(15_000) });
    await DeliveryModel.updateOne({}, { $set: { status: 'DEAD_LETTER', attempts: 4 } });

    const delivery = await DeliveryModel.findOne({});
    const response = await api()
      .post(`/api/v1/notifications/${delivery?.id}/retry`)
      .set(auth(token))
      .expect(200);

    expect(response.body.data.status).toBe('PENDING');
    expect(response.body.data.attempts).toBe(0);
  });

  it('refuses to retry a notification that already succeeded', async () => {
    await createRule();
    await ingest({ eventId: 'evt-sent', type: 'order.created', payload: orderPayload(15_000) });
    await runDispatchCycle('worker-test');

    const delivery = await DeliveryModel.findOne({});
    await api()
      .post(`/api/v1/notifications/${delivery?.id}/retry`)
      .set(auth(token))
      .expect(409);
  });
});
