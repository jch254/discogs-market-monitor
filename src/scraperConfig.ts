import { logEvent } from './log';

// Env-driven scraper configuration with safe defaults and validation. All
// values are clamped/defaulted so a typo'd or hostile env var can never create
// a zero-timeout, an unbounded retry loop or a retry budget that exceeds the
// Lambda timeout. Defaults are safe with no environment variables set.

// Browser profiles verified to pass Discogs' Cloudflare check (every Chrome
// profile gets 403'd). The name must be a node-tls-client ClientIdentifier and
// the UA must match the TLS fingerprint's browser family or Cloudflare scores
// the request down.
export interface BrowserProfileConfig {
  name: string;
  userAgent: string;
}

export const KNOWN_PROFILES: Record<string, BrowserProfileConfig> = {
  safari_16_0: {
    name: 'safari_16_0',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  },
  firefox_117: {
    name: 'firefox_117',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:117.0) Gecko/20100101 Firefox/117.0',
  },
};

const DEFAULT_PROFILE_NAMES = ['safari_16_0', 'firefox_117'];

export interface ScraperConfig {
  // Hard per-request timeout (Promise.race backstop; node-tls-client's own
  // timeout has been observed not firing on stalled reads).
  requestTimeoutMs: number;
  // Total in-process attempts per release (1 initial + N-1 retries).
  maxAttempts: number;
  // Consecutive exhausted failures before the warm-container circuit opens.
  circuitFailureThreshold: number;
  // How long the circuit stays open (fail fast, no Discogs calls).
  circuitOpenMs: number;
  profiles: BrowserProfileConfig[];
}

// Parses a positive integer env var, falling back to (and clamping around) the
// default. NaN, zero, negative and absurd values must never produce a
// zero-timeout or infinite-retry config, so out-of-range input is clamped and
// a warning logged rather than thrown.
export const intFromEnv = (
  name: string,
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number => {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    logEvent('scraper_config_invalid', {
      field: name,
      reason: 'not a number, using default',
    });

    return defaultValue;
  }

  const clamped = Math.min(max, Math.max(min, Math.floor(parsed)));

  if (clamped !== parsed) {
    logEvent('scraper_config_invalid', {
      field: name,
      reason: `out of range [${min}, ${max}], clamped to ${clamped}`,
    });
  }

  return clamped;
};

const profilesFromEnv = (value: string | undefined): BrowserProfileConfig[] => {
  const requested = (value ?? '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);

  if (requested.length === 0) {
    return DEFAULT_PROFILE_NAMES.map(name => KNOWN_PROFILES[name]);
  }

  const valid: BrowserProfileConfig[] = [];

  for (const name of requested) {
    if (KNOWN_PROFILES[name]) {
      valid.push(KNOWN_PROFILES[name]);
    } else {
      // Unknown profile names are ignored (an unverified TLS fingerprint
      // would just burn attempts on guaranteed 403s).
      logEvent('scraper_config_invalid', {
        field: 'SCRAPER_PROFILES',
        reason: `unknown profile "${name}" ignored`,
      });
    }
  }

  if (valid.length === 0) {
    logEvent('scraper_config_invalid', {
      field: 'SCRAPER_PROFILES',
      reason: 'no valid profiles configured, using defaults',
    });

    return DEFAULT_PROFILE_NAMES.map(name => KNOWN_PROFILES[name]);
  }

  return valid;
};

// Worst-case backoff sleep between scrape attempts: maxDelayMs (15s) plus 50%
// jitter, as configured in marketplaceRss.
const MAX_BACKOFF_PER_RETRY_MS = 22500;

// The checkReleaseMarketplace Lambda timeout is 300s; the scrape (attempts +
// backoff) must leave headroom for the Discogs API listing fetches that follow.
const SCRAPE_BUDGET_MS = 240000;

export const loadScraperConfig = (
  env: NodeJS.ProcessEnv = process.env,
): ScraperConfig => {
  const requestTimeoutMs = intFromEnv(
    'SCRAPER_REQUEST_TIMEOUT_MS',
    env.SCRAPER_REQUEST_TIMEOUT_MS,
    25000,
    1000,
    60000,
  );

  let maxAttempts = intFromEnv(
    'SCRAPER_MAX_ATTEMPTS',
    env.SCRAPER_MAX_ATTEMPTS,
    4,
    1,
    6,
  );

  // Cross-field guard: individually-valid values must not combine into a
  // retry budget that exceeds the Lambda timeout (e.g. 6 attempts x 60s).
  // Trim attempts until the worst case fits.
  const worstCaseMs = (attempts: number) =>
    attempts * requestTimeoutMs + (attempts - 1) * MAX_BACKOFF_PER_RETRY_MS;

  if (worstCaseMs(maxAttempts) > SCRAPE_BUDGET_MS) {
    const original = maxAttempts;

    while (maxAttempts > 1 && worstCaseMs(maxAttempts) > SCRAPE_BUDGET_MS) {
      maxAttempts -= 1;
    }

    logEvent('scraper_config_invalid', {
      field: 'SCRAPER_MAX_ATTEMPTS',
      reason: `worst-case retry time would exceed the Lambda budget, reduced from ${original} to ${maxAttempts}`,
    });
  }

  return {
    requestTimeoutMs,
    maxAttempts,
    circuitFailureThreshold: intFromEnv(
      'SCRAPER_CIRCUIT_FAILURE_THRESHOLD',
      env.SCRAPER_CIRCUIT_FAILURE_THRESHOLD,
      3,
      1,
      20,
    ),
    circuitOpenMs: intFromEnv(
      'SCRAPER_CIRCUIT_OPEN_MS',
      env.SCRAPER_CIRCUIT_OPEN_MS,
      120000,
      1000,
      3600000,
    ),
    profiles: profilesFromEnv(env.SCRAPER_PROFILES),
  };
};
