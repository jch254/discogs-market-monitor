import { initTLS, ClientIdentifier, Session } from 'node-tls-client';
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
//
// node-tls-client loads a small native helper via koffi and, on first use,
// downloads a platform shared library into os.tmpdir() (writable /tmp on
// Lambda). Both must be kept out of the esbuild bundle - see the `build.esbuild`
// external list in serverless.yml.

interface BrowserProfile {
  clientIdentifier: ClientIdentifier;
  userAgent: string;
}

// Profiles verified to pass Discogs' Cloudflare check (every Chrome profile
// gets 403'd). The UA must match the TLS fingerprint's browser family or
// Cloudflare scores the request down.
const PROFILES: BrowserProfile[] = [
  {
    clientIdentifier: ClientIdentifier.safari_16_0,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  },
  {
    clientIdentifier: ClientIdentifier.firefox_117,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:117.0) Gecko/20100101 Firefox/117.0',
  },
];

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

// node-tls-client's own timeout has been observed not firing on stalled reads
// (a prod request hung until the Lambda's 60s cap killed the invocation), so
// every request is also raced against HARD_TIMEOUT_MS as a backstop.
const SESSION_TIMEOUT_MS = 20000;
const HARD_TIMEOUT_MS = 25000;

// Start each container at a random profile so concurrent containers don't all
// present the same fingerprint.
let profileCursor = Math.floor(Math.random() * PROFILES.length);
let activeProfile = PROFILES[profileCursor % PROFILES.length];
let sessionPromise: Promise<Session> | undefined;

const getSession = (): Promise<Session> => {
  if (!sessionPromise) {
    activeProfile = PROFILES[profileCursor % PROFILES.length];
    const profile = activeProfile;

    sessionPromise = (async () => {
      await initTLS();
      return new Session({
        clientIdentifier: profile.clientIdentifier,
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
// are linked as /sell/item/<id> throughout the page markup.
const extractListingIdsFromHtml = (html: string): string[] => {
  const ids = new Set<string>();

  for (const match of html.matchAll(/\/sell\/item\/(\d+)/g)) {
    ids.add(match[1]);
  }

  return [...ids];
};

const retryableError = (message: string, statusCode?: number) => {
  const error: any = new Error(message);
  error.retryable = true;

  if (statusCode !== undefined) {
    error.statusCode = statusCode;
  }

  return error;
};

const fetchSellPageHtml = async (
  url: string,
  releaseId: string | number,
): Promise<string> => {
  const session = await getSession();
  const profile = activeProfile;

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const hardTimeout = new Promise<never>((_, reject) => {
    const timeoutError = () =>
      retryableError(
        `Discogs sell page request hung for ${HARD_TIMEOUT_MS}ms for release ${releaseId}`,
      );

    timeoutHandle = setTimeout(() => reject(timeoutError()), HARD_TIMEOUT_MS);
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
      const error: any = new Error(
        `Discogs sell page returned ${response.status} for release ${releaseId}`,
      );
      error.statusCode = response.status;
      // 403 = Cloudflare block (rotate + retry), 5xx = transient (retry).
      // 429 is retried by withRetry without rotating. Anything else (e.g. 404)
      // fails this release's check immediately (isolated per release).
      error.retryable = response.status === 403 || response.status >= 500;
      throw error;
    }

    if (CHALLENGE_MARKERS.some(marker => body.includes(marker))) {
      throw retryableError(
        `Discogs sell page served a Cloudflare challenge for release ${releaseId}`,
        403,
      );
    }

    return body;
  } catch (error: any) {
    // Errors with no HTTP status are transport/native-client failures
    // (connection reset, TLS, koffi) - retry those on a fresh session too.
    if (
      error instanceof Error &&
      (error as any).retryable === undefined &&
      (error as any).statusCode === undefined
    ) {
      (error as any).retryable = true;
    }

    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

export const getReleaseListingIds = async (
  releaseId: string | number,
): Promise<string[]> => {
  await sleep(THROTTLE_MS);

  const url = `https://www.discogs.com/sell/release/${releaseId}?limit=${PAGE_SIZE}&sort=listed&sort_order=desc`;

  return withRetry(
    async () => {
      try {
        const html = await fetchSellPageHtml(url, releaseId);
        return extractListingIdsFromHtml(html);
      } catch (error: any) {
        if (error?.retryable) {
          await rotateSession();
        }

        throw error;
      }
    },
    {
      label: `sell page ${releaseId}`,
      maxRetries: 3,
      baseDelayMs: 2000,
      maxDelayMs: 15000,
      shouldRetry: error =>
        isRateLimitError(error) || error?.retryable === true,
    },
  );
};
