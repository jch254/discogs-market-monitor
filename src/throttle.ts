// Deterministic throttling + retry helpers for external API calls.
//
// These replace the in-memory LeakyBucket as the *primary* rate-limit control.
// An in-memory bucket cannot coordinate across concurrent Lambda invocations, so
// instead we (a) sleep a fixed amount between every external call and (b) retry
// rate-limited (HTTP 429) calls with jittered exponential backoff.

// Discogs throttles authenticated requests to 60/min per source IP (1 every
// ~1000ms). We default to a slightly larger gap for headroom. Configurable via
// env so it can be tuned without a code change.
export const THROTTLE_MS = Number(process.env.DISCOGS_THROTTLE_MS) || 1100;

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const isRateLimitError = (error: any): boolean =>
  error?.statusCode === 429 ||
  error?.status === 429 ||
  (typeof error?.message === 'string' && error.message.includes('429'));

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
  // Which errors to retry. Defaults to rate-limit (429) errors only; callers
  // can widen this (e.g. the sell-page scraper also retries Cloudflare blocks
  // after rotating its session). Non-matching errors propagate immediately.
  shouldRetry?: (error: any) => boolean;
}

// Retries `fn` when it fails with a retryable error (per `shouldRetry`), using
// exponential backoff with jitter.
export const withRetry = async <T>(
  fn: () => Promise<T>,
  {
    maxRetries = 5,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    label = 'discogs request',
    shouldRetry = isRateLimitError,
  }: RetryOptions = {},
): Promise<T> => {
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      if (!shouldRetry(error) || attempt >= maxRetries) {
        throw error;
      }

      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const jitter = Math.random() * backoff * 0.5;
      const delayMs = Math.round(backoff + jitter);

      attempt += 1;

      console.log('RETRYABLE DISCOGS ERROR, BACKING OFF BEFORE RETRY', {
        label,
        attempt,
        maxRetries,
        delayMs,
        message: error?.message,
      });

      await sleep(delayMs);
    }
  }
};
