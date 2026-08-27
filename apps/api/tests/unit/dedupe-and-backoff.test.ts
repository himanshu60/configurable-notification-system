import { describe, expect, it } from 'vitest';
import { buildDedupeKey } from '../../src/engine/dedupe.js';
import { backoffDelayMs } from '../../src/worker/backoff.js';

const base = {
  ruleId: 'rule-1',
  channel: 'EMAIL' as const,
  recipient: 'dana@example.com',
  eventId: 'evt-1',
  dedupeWindowSec: 0,
};

describe('buildDedupeKey', () => {
  it('is stable for the same inputs, which is what makes redelivery safe', () => {
    expect(buildDedupeKey(base)).toBe(buildDedupeKey(base));
  });

  it('is case insensitive on the recipient address', () => {
    expect(buildDedupeKey({ ...base, recipient: 'DANA@example.com' })).toBe(buildDedupeKey(base));
  });

  it.each([
    ['rule', { ruleId: 'rule-2' }],
    ['channel', { channel: 'IN_APP' as const }],
    ['recipient', { recipient: 'sam@example.com' }],
    ['event', { eventId: 'evt-2' }],
  ])('differs when the %s differs', (_label, override) => {
    expect(buildDedupeKey({ ...base, ...override })).not.toBe(buildDedupeKey(base));
  });

  describe('with a dedupe window', () => {
    const windowed = { ...base, dedupeWindowSec: 300 };

    it('collapses distinct events inside the same window', () => {
      const now = new Date('2026-08-27T10:00:00.000Z');

      expect(buildDedupeKey({ ...windowed, eventId: 'evt-1', now })).toBe(
        buildDedupeKey({ ...windowed, eventId: 'evt-2', now }),
      );
    });

    it('separates events that land in different windows', () => {
      expect(
        buildDedupeKey({ ...windowed, now: new Date('2026-08-27T10:00:00.000Z') }),
      ).not.toBe(buildDedupeKey({ ...windowed, now: new Date('2026-08-27T10:06:00.000Z') }));
    });
  });
});

describe('backoffDelayMs', () => {
  const options = { baseMs: 1000, maxMs: 60_000, jitterRatio: 0 };

  it('grows exponentially', () => {
    expect(backoffDelayMs(1, options)).toBe(1000);
    expect(backoffDelayMs(2, options)).toBe(2000);
    expect(backoffDelayMs(3, options)).toBe(4000);
    expect(backoffDelayMs(4, options)).toBe(8000);
  });

  it('never exceeds the ceiling', () => {
    expect(backoffDelayMs(50, options)).toBe(60_000);
  });

  it('never drops below the base delay', () => {
    expect(backoffDelayMs(0, options)).toBe(1000);
  });

  it('applies jitter so a fleet of retries does not synchronise', () => {
    const jittered = { baseMs: 1000, maxMs: 60_000, jitterRatio: 0.5 };
    const delays = new Set(Array.from({ length: 40 }, () => backoffDelayMs(4, jittered)));

    expect(delays.size).toBeGreaterThan(1);
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(12_000);
    }
  });
});
