export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  /** 0..1 proportion of the delay that is randomised. */
  jitterRatio?: number;
  random?: () => number;
}

/**
 * Exponential backoff with full-width jitter.
 *
 * The jitter matters more than the exponent: without it, a provider outage
 * makes every delivery queued in the same second retry in the same second
 * forever, and the recovery attempt becomes a second outage.
 */
export const backoffDelayMs = (attempt: number, options: BackoffOptions): number => {
  const { baseMs, maxMs, jitterRatio = 0.25, random = Math.random } = options;

  const exponential = Math.min(baseMs * 2 ** Math.max(0, attempt - 1), maxMs);
  const jitter = exponential * jitterRatio * (random() * 2 - 1);

  return Math.max(baseMs, Math.round(Math.min(maxMs, exponential + jitter)));
};

export const nextAttemptDate = (attempt: number, options: BackoffOptions, now = new Date()): Date =>
  new Date(now.getTime() + backoffDelayMs(attempt, options));
