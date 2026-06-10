import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Module-level mocks for node-tls-client (vi.mock factories are hoisted, so
// shared state must come from vi.hoisted).
const tls = vi.hoisted(() => {
  const get = vi.fn();
  const close = vi.fn(async () => undefined);
  // Constructed with `new`, so it must be a regular function, not an arrow.
  // tslint:disable-next-line:ter-prefer-arrow-callback
  const Session = vi.fn(function session() {
    return { get, close };
  });
  const initTLS = vi.fn(async () => undefined);

  return { get, close, Session, initTLS };
});

vi.mock('node-tls-client', () => ({
  initTLS: tls.initTLS,
  Session: tls.Session,
  ClientIdentifier: {
    safari_16_0: 'safari_16_0',
    firefox_117: 'firefox_117',
  },
}));

// HTML fixtures mirroring live-verified sell pages.
const sellPage = (ids: string[]) =>
  `<html><body><div id="pjax_container">${ids
    .map(
      id =>
        `<a href="/sell/item/${id}">listing</a><a href="/sell/item/${id}">duplicate link</a>`,
    )
    .join('')}</div></body></html>`;

// A real zero-listing sell page still has the pjax container and For Sale
// title (verified live against release 31234567).
const ZERO_LISTING_PAGE =
  '<html><head><title>Artist - Title (Vinyl) For Sale | Discogs</title></head>' +
  '<body><div id="pjax_container"></div></body></html>';

// Normal Discogs pages embed a Cloudflare analytics script; that alone must
// NOT be treated as a challenge.
const PAGE_WITH_CDN_CGI = `${sellPage([
  '111',
])}<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>`;

const CHALLENGE_PAGE =
  '<html><head><title>Just a moment...</title></head><body>_cf_chl_opt</body></html>';

// A 200 body that is not a sell page at all (no listing links, no markers).
const NOT_A_SELL_PAGE = '<html><body>Something else entirely</body></html>';

const ok = (body: string) => ({ status: 200, text: async () => body });
const status = (code: number) => ({ status: code, text: async () => 'error page' });

const importScraper = () => import('../src/marketplaceRss');

// Kicks off a scrape and flushes throttle/backoff/timeout fake timers until it
// settles. The no-op catch keeps an expected rejection from being flagged as
// unhandled while timers are flushed.
const run = async <T>(promise: Promise<T>): Promise<T> => {
  promise.catch(() => undefined);

  await vi.runAllTimersAsync();

  return promise;
};

// Checks by name/type rather than instanceof: vi.resetModules() gives each
// test a fresh scraper module whose ScraperError class identity differs from
// this file's static import.
const expectScraperFailure = async (
  promise: Promise<unknown>,
  type: string,
) => {
  let caught: any;

  try {
    await run(promise);
  } catch (error) {
    caught = error;
  }

  expect(caught, 'expected scrape to fail').toBeDefined();
  expect(caught.name).toBe('ScraperError');
  expect(caught.type).toBe(type);

  return caught;
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  tls.get.mockReset();
  tls.close.mockClear();
  tls.Session.mockClear();
  tls.initTLS.mockClear();
  // Keep tests fast and deterministic.
  process.env.DISCOGS_THROTTLE_MS = '1';
  delete process.env.SCRAPER_REQUEST_TIMEOUT_MS;
  delete process.env.SCRAPER_MAX_ATTEMPTS;
  delete process.env.SCRAPER_CIRCUIT_FAILURE_THRESHOLD;
  delete process.env.SCRAPER_CIRCUIT_OPEN_MS;
  delete process.env.SCRAPER_PROFILES;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getReleaseListingIds', () => {
  it('returns unique listing ids from a sell page with duplicate links', async () => {
    tls.get.mockResolvedValueOnce(ok(sellPage(['123', '456', '123'])));

    const { getReleaseListingIds } = await importScraper();
    const ids = await run(getReleaseListingIds(1));

    expect(ids).toEqual(['123', '456']);
    expect(tls.get).toHaveBeenCalledTimes(1);
  });

  it('treats a genuine zero-listing sell page as a successful empty result', async () => {
    tls.get.mockResolvedValueOnce(ok(ZERO_LISTING_PAGE));

    const { getReleaseListingIds } = await importScraper();
    const ids = await run(getReleaseListingIds(1));

    expect(ids).toEqual([]);
    expect(tls.get).toHaveBeenCalledTimes(1);
  });

  it('does not treat normal pages containing /cdn-cgi/challenge-platform/ as challenges', async () => {
    tls.get.mockResolvedValueOnce(ok(PAGE_WITH_CDN_CGI));

    const { getReleaseListingIds } = await importScraper();
    const ids = await run(getReleaseListingIds(1));

    expect(ids).toEqual(['111']);
    expect(tls.get).toHaveBeenCalledTimes(1);
  });

  it('rotates the session and retries on 403', async () => {
    tls.get
      .mockResolvedValueOnce(status(403))
      .mockResolvedValueOnce(ok(sellPage(['9'])));

    const { getReleaseListingIds } = await importScraper();
    const ids = await run(getReleaseListingIds(1));

    expect(ids).toEqual(['9']);
    expect(tls.get).toHaveBeenCalledTimes(2);
    expect(tls.close).toHaveBeenCalledTimes(1);
    expect(tls.Session).toHaveBeenCalledTimes(2);

    // With two profiles, rotation must change the TLS fingerprint.
    const [first, second] = tls.Session.mock.calls.map(
      (call: any[]) => call[0].clientIdentifier,
    );
    expect(first).not.toBe(second);
  });

  it('rotates the session and retries on 5xx', async () => {
    tls.get
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(ok(sellPage(['9'])));

    const { getReleaseListingIds } = await importScraper();

    await expect(run(getReleaseListingIds(1))).resolves.toEqual(['9']);
    expect(tls.Session).toHaveBeenCalledTimes(2);
  });

  it('rotates the session and retries on transport errors', async () => {
    tls.get
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(ok(sellPage(['9'])));

    const { getReleaseListingIds } = await importScraper();

    await expect(run(getReleaseListingIds(1))).resolves.toEqual(['9']);
    expect(tls.Session).toHaveBeenCalledTimes(2);
  });

  it('rotates the session and retries when a request hangs past the hard timeout', async () => {
    tls.get
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce(ok(sellPage(['9'])));

    const { getReleaseListingIds } = await importScraper();

    await expect(run(getReleaseListingIds(1))).resolves.toEqual(['9']);
    expect(tls.get).toHaveBeenCalledTimes(2);
    expect(tls.Session).toHaveBeenCalledTimes(2);
  });

  it('rotates the session and retries on an HTTP 200 challenge page', async () => {
    tls.get
      .mockResolvedValueOnce(ok(CHALLENGE_PAGE))
      .mockResolvedValueOnce(ok(sellPage(['9'])));

    const { getReleaseListingIds } = await importScraper();

    await expect(run(getReleaseListingIds(1))).resolves.toEqual(['9']);
    expect(tls.Session).toHaveBeenCalledTimes(2);
  });

  it('treats an unrecognisable 200 page as parse_error, never as zero listings', async () => {
    tls.get.mockResolvedValue(ok(NOT_A_SELL_PAGE));

    const { getReleaseListingIds } = await importScraper();
    const error = await expectScraperFailure(
      getReleaseListingIds(1),
      'parse_error',
    );

    expect(error.status).toBe(200);
    // Retried (parser mismatch may be a mangled block page) then exhausted.
    expect(tls.get).toHaveBeenCalledTimes(4);
  });

  it('throws a typed blocked failure after exhausting attempts', async () => {
    tls.get.mockResolvedValue(status(403));

    const { getReleaseListingIds } = await importScraper();
    const error = await expectScraperFailure(
      getReleaseListingIds(14756037),
      'blocked',
    );

    expect(error.releaseId).toBe('14756037');
    expect(error.status).toBe(403);
    expect(error.attempt).toBe(4);
    expect(error.maxAttempts).toBe(4);
    expect(tls.get).toHaveBeenCalledTimes(4);
  });

  it('fails 404s immediately without in-process retries', async () => {
    tls.get.mockResolvedValue(status(404));

    const { getReleaseListingIds } = await importScraper();
    const error = await expectScraperFailure(
      getReleaseListingIds(1),
      'unexpected',
    );

    expect(error.status).toBe(404);
    expect(tls.get).toHaveBeenCalledTimes(1);
  });

  it('honours SCRAPER_MAX_ATTEMPTS and survives invalid values', async () => {
    process.env.SCRAPER_MAX_ATTEMPTS = '2';
    tls.get.mockResolvedValue(status(403));

    let scraper = await importScraper();
    await expectScraperFailure(scraper.getReleaseListingIds(1), 'blocked');
    expect(tls.get).toHaveBeenCalledTimes(2);

    // Invalid config must fall back to the bounded default (4 attempts), not
    // zero or infinite retries.
    vi.resetModules();
    tls.get.mockClear();
    process.env.SCRAPER_MAX_ATTEMPTS = 'unbounded';

    scraper = await importScraper();
    await expectScraperFailure(scraper.getReleaseListingIds(1), 'blocked');
    expect(tls.get).toHaveBeenCalledTimes(4);
  });

  describe('circuit breaker', () => {
    it('opens after consecutive exhausted failures and fails fast without network calls', async () => {
      tls.get.mockResolvedValue(status(403));

      const { getReleaseListingIds } = await importScraper();

      // Default threshold: 3 consecutive exhausted releases.
      for (let i = 0; i < 3; i += 1) {
        await expectScraperFailure(getReleaseListingIds(i), 'blocked');
      }

      const callsBeforeOpenCircuit = tls.get.mock.calls.length;
      const error = await expectScraperFailure(
        getReleaseListingIds(99),
        'circuit_open',
      );

      expect(error.retryable).toBe(false);
      // Open circuit means no Discogs request at all.
      expect(tls.get).toHaveBeenCalledTimes(callsBeforeOpenCircuit);
    });

    it('resets the consecutive failure count after a success', async () => {
      const { getReleaseListingIds } = await importScraper();

      tls.get.mockResolvedValue(status(403));
      await expectScraperFailure(getReleaseListingIds(1), 'blocked');
      await expectScraperFailure(getReleaseListingIds(2), 'blocked');

      tls.get.mockResolvedValue(ok(sellPage(['5'])));
      await expect(run(getReleaseListingIds(3))).resolves.toEqual(['5']);

      // Two more exhausted failures: without the reset these would be #3 and
      // #4 and the circuit would be open; with it the count restarts.
      tls.get.mockResolvedValue(status(403));
      await expectScraperFailure(getReleaseListingIds(4), 'blocked');
      await expectScraperFailure(getReleaseListingIds(5), 'blocked');

      tls.get.mockResolvedValue(ok(sellPage(['6'])));
      await expect(run(getReleaseListingIds(6))).resolves.toEqual(['6']);
    });

    it('allows a new attempt after the open window elapses', async () => {
      process.env.SCRAPER_CIRCUIT_OPEN_MS = '5000';
      tls.get.mockResolvedValue(status(403));

      const { getReleaseListingIds } = await importScraper();

      for (let i = 0; i < 3; i += 1) {
        await expectScraperFailure(getReleaseListingIds(i), 'blocked');
      }

      await expectScraperFailure(getReleaseListingIds(99), 'circuit_open');

      vi.advanceTimersByTime(6000);
      tls.get.mockResolvedValue(ok(sellPage(['7'])));

      await expect(run(getReleaseListingIds(100))).resolves.toEqual(['7']);
    });

    it('does not count non-block failures (404) toward the circuit', async () => {
      tls.get.mockResolvedValue(status(404));

      const { getReleaseListingIds } = await importScraper();

      for (let i = 0; i < 5; i += 1) {
        await expectScraperFailure(getReleaseListingIds(i), 'unexpected');
      }

      // Still making real requests: the circuit never opened.
      tls.get.mockResolvedValue(ok(sellPage(['8'])));
      await expect(run(getReleaseListingIds(6))).resolves.toEqual(['8']);
    });
  });
});
