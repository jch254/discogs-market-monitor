import { initTLS, ClientIdentifier, Session } from 'node-tls-client';
import { logEvent } from './log';
import { loadScraperConfig, BrowserProfileConfig } from './scraperConfig';
import { isScraperError, ScraperError } from './scraperError';
import { isRateLimitError, sleep, withRetry, THROTTLE_MS } from './throttle';

// Fetches the marketplace listings for a single release and returns the valid
// numeric listing ids currently on sale, newest first.
//
// History: this used to read Discogs' `mplistrss` RSS feed, but Discogs retired
// that endpoint (it returns a hard 403 to every client, including real browser
// sessions). We now read the public sell page HTML instead. That page sits
// behind Cloudflare bot management which fingerprints the TLS/HTTP2 handshake,
// so a plain Node https request is also 403'd. node-tls-client impersonates a
// real browser handshake to get a 200.
//
// Cloudflare also flags individual sessions mid-run: in prod one warm Lambda
// container 403'd persistently (its sibling kept getting 200s from the same
// run) because the flagged session - cookies plus TLS state - was cached for
// the container's lifetime. Blocks therefore rotate the session: the flagged
// one is closed and the next attempt rebuilds with the next browser profile.
// If even rotated sessions keep failing, a module-local circuit breaker stops
// this container hammering Discogs (see below).
//
// node-tls-client loads a small native helper via koffi and, on first use,
// downloads a platform shared library into os.tmpdir() (writable /tmp on
// Lambda). Both must be kept out of the esbuild bundle - see the `build.esbuild`
// external list in serverless.yml.

const CONFIG = loadScraperConfig();

// Discogs paginates the sell page; pull the largest page sorted newest-first so
// a single request surfaces the most recently listed items (the ones most
// likely to be new). Releases with > 250 live listings are capped here, which
// is an acceptable edge case for a "what's new" digest.
const PAGE_SIZE = 250;

// Cloudflare sometimes serves its interstitial challenge page with HTTP 200;
// these markers identify it so it isn't mistaken for a release with no
// listings. Only markers unique to the interstitial qualify: normal Discogs
// pages already include a /cdn-cgi/challenge-platform/ analytics script, so
// that string would flag every healthy page (verified live).
const CHALLENGE_MARKERS = ['_cf_chl_', '<title>Just a moment...</title>'];

// Markers present on every real sell page, including genuine zero-listing
// pages (verified live against a release with no items for sale). If a 200,
// non-challenge body has no listing links AND none of these markers, the page
// is not a sell page we understand, and "no links found" must not be trusted
// to mean "no listings" - that's a parse_error, never a successful empty check.
const SELL_PAGE_MARKERS = ['pjax_container', 'For Sale | Discogs'];

// node-tls-client's own timeout has been observed not firing on stalled reads
// (a prod request hung until the Lambda's cap killed the invocation), so every
// request is also raced against the configured hard timeout as a backstop. The
// session timeout sits just below it so the client usually fails first.
const HARD_TIMEOUT_MS = CONFIG.requestTimeoutMs;
const SESSION_TIMEOUT_MS = Math.max(5000, HARD_TIMEOUT_MS - 5000);

// Start each container at a random profile so concurrent containers don't all
// present the same fingerprint.
let profileCursor = Math.floor(Math.random() * CONFIG.profiles.length);
let activeProfile = CONFIG.profiles[profileCursor % CONFIG.profiles.length];
let sessionPromise: Promise<Session> | undefined;

// Warm-container circuit breaker. Once Cloudflare flags a container, even
// rotated sessions can keep failing; after circuitFailureThreshold consecutive
// releases exhaust their attempts, fail fast (no Discogs calls) for
// circuitOpenMs instead of hammering on. Step Functions retries later,
// potentially on a different container. Module-local state only - never
// persisted - because the poisoning is per-container.
let consecutiveExhaustedFailures = 0;
let circuitOpenUntil = 0;

const getSession = (): Promise<Session> => {
  if (!sessionPromise) {
    activeProfile = CONFIG.profiles[profileCursor % CONFIG.profiles.length];
    const profile = activeProfile;

    sessionPromise = (async () => {
      await initTLS();
      return new Session({
        clientIdentifier:
          ClientIdentifier[profile.name as keyof typeof ClientIdentifier],
        timeout: SESSION_TIMEOUT_MS,
      });
    })();
  }

  return sessionPromise;
};

// Once Cloudflare flags a session it never recovers, so on any block the
// session is discarded and the next attempt - whether an in-process retry or a
// Step Functions retry landing on this warm container - builds a fresh one
// with the next browser profile.
const rotateSession = async (): Promise<void> => {
  const oldSessionPromise = sessionPromise;
  sessionPromise = undefined;
  profileCursor += 1;

  if (oldSessionPromise) {
    try {
      const oldSession = await oldSessionPromise;
      await oldSession.close();
    } catch {
      // Best-effort cleanup; the replacement session doesn't depend on it.
    }
  }
};

// Extracts unique numeric marketplace listing ids from sell-page HTML. Listings
// are linked as /sell/item/<id> throughout the page markup (each listing
// appears several times), so ids are deduped via a Set.
const extractListingIdsFromHtml = (html: string): string[] => {
  const ids = new Set<string>();

  for (const match of html.matchAll(/\/sell\/item\/(\d+)/g)) {
    ids.add(match[1]);
  }

  return [...ids];
};

interface AttemptContext {
  releaseId: string | number;
  attempt: number;
  maxAttempts: number;
  profile: BrowserProfileConfig;
}

const fetchSellPageHtml = async (
  url: string,
  context: AttemptContext,
): Promise<string> => {
  const { releaseId, attempt, maxAttempts, profile } = context;
  const session = await getSession();
  const startedAt = Date.now();
  const baseDetails = () => ({
    releaseId,
    attempt,
    maxAttempts,
    profile: profile.name,
    durationMs: Date.now() - startedAt,
  });

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const hardTimeout = new Promise<never>((_, reject) => {
    const onHardTimeout = () => {
      logEvent('scraper_request_timeout', {
        ...baseDetails(),
        timeoutMs: HARD_TIMEOUT_MS,
      });

      reject(
        new ScraperError('timeout', {
          ...baseDetails(),
          reason: `request hung for ${HARD_TIMEOUT_MS}ms`,
        }),
      );
    };

    timeoutHandle = setTimeout(onHardTimeout, HARD_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([
      session.get(url, {
        headers: {
          'User-Agent': profile.userAgent,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }),
      hardTimeout,
    ]);

    const body = await Promise.race([response.text(), hardTimeout]);

    if (response.status !== 200) {
      // 403 = Cloudflare block (rotate + retry), 5xx = transient (retry),
      // 429 = rate limit (retry without rotating). Anything else (e.g. 404)
      // fails this release's check immediately (isolated per release).
      const type =
        response.status === 403
          ? 'blocked'
          : response.status === 429
            ? 'rate_limited'
            : response.status >= 500
              ? 'server_error'
              : 'unexpected';

      throw new ScraperError(type, {
        ...baseDetails(),
        status: response.status,
        reason: `sell page returned HTTP ${response.status}`,
      });
    }

    if (CHALLENGE_MARKERS.some(marker => body.includes(marker))) {
      logEvent('scraper_challenge_detected', baseDetails());

      throw new ScraperError('challenge', {
        ...baseDetails(),
        status: 200,
        reason: 'sell page served a Cloudflare interstitial challenge',
      });
    }

    return body;
  } catch (error: any) {
    if (isScraperError(error)) {
      throw error;
    }

    // Anything unclassified here is a transport/native-client failure
    // (connection reset, TLS, koffi) - retry those on a fresh session too.
    // Only the (truncated) message is carried; never headers or bodies.
    throw new ScraperError('transport', {
      ...baseDetails(),
      reason: String(error?.message ?? error).slice(0, 200),
    });
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const scrapeListingIdsOnce = async (
  url: string,
  context: AttemptContext,
): Promise<string[]> => {
  const startedAt = Date.now();

  logEvent('scraper_request_start', {
    releaseId: context.releaseId,
    attempt: context.attempt,
    maxAttempts: context.maxAttempts,
    profile: context.profile.name,
  });

  const html = await fetchSellPageHtml(url, context);
  const listingIds = extractListingIdsFromHtml(html);

  // A page with no listing links is only a trustworthy "zero listings" result
  // if it is recognisably a sell page; otherwise treat it as a parser
  // mismatch so the failure is retried rather than recorded as "no listings".
  if (
    listingIds.length === 0 &&
    !SELL_PAGE_MARKERS.some(marker => html.includes(marker))
  ) {
    throw new ScraperError('parse_error', {
      releaseId: context.releaseId,
      attempt: context.attempt,
      maxAttempts: context.maxAttempts,
      profile: context.profile.name,
      status: 200,
      durationMs: Date.now() - startedAt,
      reason: 'HTTP 200 body has no listing links and no sell-page markers',
    });
  }

  logEvent('scraper_request_success', {
    releaseId: context.releaseId,
    attempt: context.attempt,
    maxAttempts: context.maxAttempts,
    profile: context.profile.name,
    durationMs: Date.now() - startedAt,
    listingIdCount: listingIds.length,
  });

  return listingIds;
};

const openCircuitIfThresholdReached = (): void => {
  if (consecutiveExhaustedFailures >= CONFIG.circuitFailureThreshold) {
    circuitOpenUntil = Date.now() + CONFIG.circuitOpenMs;

    logEvent('scraper_circuit_opened', {
      consecutiveFailures: consecutiveExhaustedFailures,
      circuitOpenMs: CONFIG.circuitOpenMs,
    });
  }
};

export const getReleaseListingIds = async (
  releaseId: string | number,
): Promise<string[]> => {
  // Fail fast while the circuit is open: no throttle sleep, no Discogs call.
  const remainingOpenMs = circuitOpenUntil - Date.now();

  if (remainingOpenMs > 0) {
    throw new ScraperError('circuit_open', {
      releaseId,
      reason: `circuit open for another ${remainingOpenMs}ms after ${consecutiveExhaustedFailures} consecutive exhausted scrape failures on this container`,
    });
  }

  await sleep(THROTTLE_MS);

  const url = `https://www.discogs.com/sell/release/${releaseId}?limit=${PAGE_SIZE}&sort=listed&sort_order=desc`;
  const maxAttempts = CONFIG.maxAttempts;
  let attempt = 0;

  try {
    const listingIds = await withRetry(
      async () => {
        attempt += 1;
        const context: AttemptContext = {
          releaseId,
          attempt,
          maxAttempts,
          profile: activeProfile,
        };

        try {
          return await scrapeListingIdsOnce(url, context);
        } catch (error: any) {
          if (isScraperError(error)) {
            logEvent('scraper_attempt_failed', error.toLogFields());

            if (error.rotatesSession) {
              await rotateSession();
              logEvent('scraper_session_rotated', {
                releaseId,
                attempt,
                maxAttempts,
                profile: activeProfile.name,
                errorType: error.type,
              });
            }
          }

          throw error;
        }
      },
      {
        label: `sell page ${releaseId}`,
        maxRetries: maxAttempts - 1,
        baseDelayMs: 2000,
        maxDelayMs: 15000,
        shouldRetry: error =>
          isRateLimitError(error) ||
          (isScraperError(error) && error.retryable),
        onRetryScheduled: ({ delayMs }) =>
          logEvent('scraper_retry_scheduled', {
            releaseId,
            attempt,
            maxAttempts,
            delayMs,
          }),
      },
    );

    // A successful read proves this container/session is healthy again.
    consecutiveExhaustedFailures = 0;

    return listingIds;
  } catch (error: any) {
    if (isScraperError(error) && error.rotatesSession) {
      // Exhausted block-style failures (not 404s or rate limits) are the
      // poisoned-container signal the circuit breaker counts.
      consecutiveExhaustedFailures += 1;
      logEvent('scraper_attempts_exhausted', error.toLogFields());
      openCircuitIfThresholdReached();
    }

    throw error;
  }
};
