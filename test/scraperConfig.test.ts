import { describe, expect, it } from 'vitest';
import { intFromEnv, loadScraperConfig, KNOWN_PROFILES } from '../src/scraperConfig';

describe('loadScraperConfig', () => {
  it('returns safe defaults with no environment variables set', () => {
    const config = loadScraperConfig({});

    expect(config.requestTimeoutMs).toBe(25000);
    expect(config.maxAttempts).toBe(4);
    expect(config.circuitFailureThreshold).toBe(3);
    expect(config.circuitOpenMs).toBe(120000);
    expect(config.profiles.map(p => p.name)).toEqual([
      'safari_16_0',
      'firefox_117',
    ]);
  });

  it('uses valid env overrides', () => {
    const config = loadScraperConfig({
      SCRAPER_REQUEST_TIMEOUT_MS: '10000',
      SCRAPER_MAX_ATTEMPTS: '2',
      SCRAPER_CIRCUIT_FAILURE_THRESHOLD: '5',
      SCRAPER_CIRCUIT_OPEN_MS: '60000',
      SCRAPER_PROFILES: 'firefox_117',
    });

    expect(config.requestTimeoutMs).toBe(10000);
    expect(config.maxAttempts).toBe(2);
    expect(config.circuitFailureThreshold).toBe(5);
    expect(config.circuitOpenMs).toBe(60000);
    expect(config.profiles.map(p => p.name)).toEqual(['firefox_117']);
  });

  it('never produces zero-timeout or unbounded-retry config from bad input', () => {
    const config = loadScraperConfig({
      SCRAPER_REQUEST_TIMEOUT_MS: '0',
      SCRAPER_MAX_ATTEMPTS: '-3',
      SCRAPER_CIRCUIT_FAILURE_THRESHOLD: 'NaN',
      SCRAPER_CIRCUIT_OPEN_MS: 'banana',
    });

    expect(config.requestTimeoutMs).toBeGreaterThanOrEqual(1000);
    expect(config.maxAttempts).toBeGreaterThanOrEqual(1);
    expect(config.circuitFailureThreshold).toBe(3);
    expect(config.circuitOpenMs).toBe(120000);
  });

  it('clamps absurdly large values and keeps the retry budget inside the Lambda timeout', () => {
    const config = loadScraperConfig({
      SCRAPER_REQUEST_TIMEOUT_MS: '99999999',
      SCRAPER_MAX_ATTEMPTS: '1000',
      SCRAPER_CIRCUIT_OPEN_MS: '999999999999',
    });

    expect(config.requestTimeoutMs).toBeLessThanOrEqual(60000);
    expect(config.maxAttempts).toBeLessThanOrEqual(6);
    expect(config.circuitOpenMs).toBeLessThanOrEqual(3600000);

    // Worst-case in-process scrape time must fit a 300s Lambda timeout with
    // headroom: attempts x timeout + bounded backoff (22.5s max per retry).
    const worstCaseMs =
      config.maxAttempts * config.requestTimeoutMs +
      (config.maxAttempts - 1) * 22500;
    expect(worstCaseMs).toBeLessThanOrEqual(240000);
  });

  it('keeps the default retry budget inside the Lambda timeout', () => {
    const config = loadScraperConfig({});
    const worstCaseMs =
      config.maxAttempts * config.requestTimeoutMs +
      (config.maxAttempts - 1) * 22500;

    expect(worstCaseMs).toBeLessThanOrEqual(240000);
    // The cross-field guard must not eat into valid default config.
    expect(config.maxAttempts).toBe(4);
  });

  it('ignores unknown profile names with a fallback to defaults when none are valid', () => {
    const partial = loadScraperConfig({
      SCRAPER_PROFILES: 'safari_16_0,chrome_120,not_a_profile',
    });
    expect(partial.profiles.map(p => p.name)).toEqual(['safari_16_0']);

    const none = loadScraperConfig({ SCRAPER_PROFILES: 'chrome_120' });
    expect(none.profiles.map(p => p.name)).toEqual([
      'safari_16_0',
      'firefox_117',
    ]);
  });

  it('known profiles all have a matching browser-family user agent', () => {
    expect(KNOWN_PROFILES.safari_16_0.userAgent).toContain('Safari');
    expect(KNOWN_PROFILES.firefox_117.userAgent).toContain('Firefox');
  });
});

describe('intFromEnv', () => {
  it('falls back to the default for undefined, empty and non-numeric values', () => {
    expect(intFromEnv('X', undefined, 7, 1, 10)).toBe(7);
    expect(intFromEnv('X', '', 7, 1, 10)).toBe(7);
    expect(intFromEnv('X', 'abc', 7, 1, 10)).toBe(7);
  });

  it('clamps out-of-range values and floors fractions', () => {
    expect(intFromEnv('X', '-5', 7, 1, 10)).toBe(1);
    expect(intFromEnv('X', '50', 7, 1, 10)).toBe(10);
    expect(intFromEnv('X', '3.9', 7, 1, 10)).toBe(3);
  });
});
