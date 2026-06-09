import { ClientIdentifier, Session, initTLS } from 'node-tls-client';
import { sleep, withRetry, THROTTLE_MS } from './throttle';

// Fetches the marketplace listings for a single release and returns the valid
// numeric listing ids currently on sale, newest first.
//
// History: this used to read Discogs' `mplistrss` RSS feed, but Discogs retired
// that endpoint (it returns a hard 403 to every client, including real browser
// sessions). We now read the public sell page HTML instead. That page sits
// behind Cloudflare bot management which fingerprints the TLS/HTTP2 handshake,
// so a plain Node https request is also 403'd. node-tls-client impersonates a
// real browser handshake (Safari 16 reliably passes) to get a 200.
//
// node-tls-client loads a small native helper via koffi and, on first use,
// downloads a platform shared library into os.tmpdir() (writable /tmp on
// Lambda). Both must be kept out of the esbuild bundle - see the `build.esbuild`
// external list in serverless.yml.

// A real Safari UA paired with the safari_16_0 TLS profile.
const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15';

// Discogs paginates the sell page; pull the largest page sorted newest-first so
// a single request surfaces the most recently listed items (the ones most
// likely to be new). Releases with > 250 live listings are capped here, which
// is an acceptable edge case for a "what's new" digest.
const PAGE_SIZE = 250;

let sessionPromise: Promise<Session> | undefined;

const getSession = async (): Promise<Session> => {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      await initTLS();
      return new Session({
        clientIdentifier: ClientIdentifier.safari_16_0,
        timeout: 30000,
      });
    })();
  }
  return sessionPromise;
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

export const getReleaseListingIds = async (
  releaseId: string | number,
): Promise<string[]> => {
  await sleep(THROTTLE_MS);

  const url = `https://www.discogs.com/sell/release/${releaseId}?limit=${PAGE_SIZE}&sort=listed&sort_order=desc`;

  return withRetry(
    async () => {
      const session = await getSession();
      const response = await session.get(url, {
        headers: {
          'User-Agent': SAFARI_UA,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      const body = await response.text();

      if (response.status !== 200) {
        // Surface the status so withRetry can back off on 429s; everything else
        // propagates and fails this release's check (isolated per release).
        const error: any = new Error(
          `Discogs sell page returned ${response.status} for release ${releaseId}`,
        );
        error.statusCode = response.status;
        throw error;
      }

      return extractListingIdsFromHtml(body);
    },
    { label: `sell page ${releaseId}` },
  );
};
