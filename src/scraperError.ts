// Typed failure classification for the Discogs sell-page scraper. Every
// scraper failure surfaces as a ScraperError so logs, retry policy and tests
// can tell a Cloudflare block from a timeout from a parser mismatch.

export type ScraperFailureType =
  // Cloudflare/Discogs refused the request (HTTP 403).
  | 'blocked'
  // The request exceeded the hard in-process timeout.
  | 'timeout'
  // Connection/TLS/native-client failure with no HTTP status.
  | 'transport'
  // Discogs returned 5xx.
  | 'server_error'
  // HTTP 429 from the sell page; retried without session rotation.
  | 'rate_limited'
  // HTTP 200 but the body is a Cloudflare interstitial challenge page.
  | 'challenge'
  // HTTP 200 but the body does not look like a Discogs sell page, so "no
  // listing links found" cannot be trusted to mean "no listings".
  | 'parse_error'
  // The warm-container circuit breaker is open; no request was made.
  | 'circuit_open'
  // Anything else (e.g. HTTP 404). Not retried in-process.
  | 'unexpected';

// Failure types that indicate the cached session/container may be poisoned;
// these rotate the session before the next attempt.
const ROTATE_SESSION_TYPES: ScraperFailureType[] = [
  'blocked',
  'timeout',
  'transport',
  'server_error',
  'challenge',
  'parse_error',
];

// Failure types worth another in-process attempt.
const RETRYABLE_TYPES: ScraperFailureType[] = [
  ...ROTATE_SESSION_TYPES,
  'rate_limited',
];

export interface ScraperErrorDetails {
  releaseId: string | number;
  attempt?: number;
  maxAttempts?: number;
  profile?: string;
  status?: number;
  durationMs?: number;
  // Short, safe description. Must never contain cookies, tokens, headers,
  // HTML bodies or email addresses.
  reason: string;
}

export class ScraperError extends Error {
  public readonly type: ScraperFailureType;
  public readonly releaseId: string;
  public attempt?: number;
  public maxAttempts?: number;
  public readonly profile?: string;
  public readonly status?: number;
  public readonly durationMs?: number;

  constructor(type: ScraperFailureType, details: ScraperErrorDetails) {
    super(
      `Sell page scrape failed (${type}) for release ${details.releaseId}: ${details.reason}`,
    );

    this.name = 'ScraperError';
    this.type = type;
    this.releaseId = String(details.releaseId);
    this.attempt = details.attempt;
    this.maxAttempts = details.maxAttempts;
    this.profile = details.profile;
    this.status = details.status;
    this.durationMs = details.durationMs;
  }

  get retryable(): boolean {
    return RETRYABLE_TYPES.includes(this.type);
  }

  get rotatesSession(): boolean {
    return ROTATE_SESSION_TYPES.includes(this.type);
  }

  // Safe structured-log representation (no bodies/headers/secrets).
  toLogFields() {
    return {
      errorType: this.type,
      releaseId: this.releaseId,
      attempt: this.attempt,
      maxAttempts: this.maxAttempts,
      profile: this.profile,
      status: this.status,
      durationMs: this.durationMs,
    };
  }
}

export const isScraperError = (error: unknown): error is ScraperError =>
  error instanceof ScraperError;
