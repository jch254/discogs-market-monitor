import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRateLimitError, withRetry } from '../src/throttle';

// Runs a withRetry promise to completion under fake timers, flushing backoff
// sleeps as they are scheduled. The no-op catch keeps an expected rejection
// from being flagged as unhandled while timers are flushed.
const run = async <T>(promise: Promise<T>): Promise<T> => {
  promise.catch(() => undefined);

  await vi.runAllTimersAsync();

  return promise;
};

describe('isRateLimitError', () => {
  it('matches statusCode/status 429 and 429 messages', () => {
    expect(isRateLimitError({ statusCode: 429 })).toBe(true);
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ message: 'got 429 from api' })).toBe(true);
    expect(isRateLimitError({ statusCode: 403 })).toBe(false);
    expect(isRateLimitError(new Error('boom'))).toBe(false);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries 429s by default and resolves once the call succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 429 })
      .mockResolvedValueOnce('ok');

    await expect(run(withRetry(fn))).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-429 errors by default', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('hard failure'));

    await expect(run(withRetry(fn))).rejects.toThrow('hard failure');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('honours a custom shouldRetry predicate', async () => {
    const error: any = new Error('blocked');
    error.retryable = true;

    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('ok');

    await expect(
      run(withRetry(fn, { shouldRetry: e => e?.retryable === true })),
    ).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries and rethrows the last error', async () => {
    const fn = vi.fn().mockRejectedValue({ statusCode: 429 });

    await expect(run(withRetry(fn, { maxRetries: 2 }))).rejects.toEqual({
      statusCode: 429,
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('keeps backoff delays bounded by 1.5x maxDelayMs even with jitter', async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue({ statusCode: 429 });

    await expect(
      run(
        withRetry(fn, {
          maxRetries: 6,
          baseDelayMs: 1000,
          maxDelayMs: 4000,
          onRetryScheduled: ({ delayMs }) => delays.push(delayMs),
        }),
      ),
    ).rejects.toBeDefined();

    expect(delays).toHaveLength(6);

    for (const delayMs of delays) {
      expect(delayMs).toBeGreaterThanOrEqual(1000);
      expect(delayMs).toBeLessThanOrEqual(4000 * 1.5);
    }
  });
});
