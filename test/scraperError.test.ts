import { describe, expect, it } from 'vitest';
import { isScraperError, ScraperError } from '../src/scraperError';

describe('ScraperError', () => {
  it('classifies which failure types retry and rotate the session', () => {
    const details = { releaseId: 1, reason: 'test' };

    for (const type of [
      'blocked',
      'timeout',
      'transport',
      'server_error',
      'challenge',
      'parse_error',
    ] as const) {
      const error = new ScraperError(type, details);
      expect(error.retryable).toBe(true);
      expect(error.rotatesSession).toBe(true);
    }

    const rateLimited = new ScraperError('rate_limited', details);
    expect(rateLimited.retryable).toBe(true);
    expect(rateLimited.rotatesSession).toBe(false);

    for (const type of ['circuit_open', 'unexpected'] as const) {
      const error = new ScraperError(type, details);
      expect(error.retryable).toBe(false);
      expect(error.rotatesSession).toBe(false);
    }
  });

  it('carries safe diagnostic fields only', () => {
    const error = new ScraperError('blocked', {
      releaseId: 14756037,
      attempt: 2,
      maxAttempts: 4,
      profile: 'safari_16_0',
      status: 403,
      durationMs: 1234,
      reason: 'sell page returned HTTP 403',
    });

    expect(error.toLogFields()).toEqual({
      errorType: 'blocked',
      releaseId: '14756037',
      attempt: 2,
      maxAttempts: 4,
      profile: 'safari_16_0',
      status: 403,
      durationMs: 1234,
    });
    expect(error.message).toContain('blocked');
    expect(error.message).toContain('14756037');
    expect(isScraperError(error)).toBe(true);
    expect(isScraperError(new Error('x'))).toBe(false);
  });
});
