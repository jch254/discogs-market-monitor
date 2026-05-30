import Parser from 'rss-parser';
import { sleep, withRetry, THROTTLE_MS } from './throttle';
import { extractMarketplaceListingIds } from './utils';

const parser = new Parser();

// Fetches the marketplace RSS feed for a single release and returns the valid
// numeric listing ids currently on sale. Throttled + 429-retry-wrapped.
export const getReleaseListingIds = async (
  releaseId: string | number,
): Promise<string[]> => {
  await sleep(THROTTLE_MS);

  const { items } = await withRetry(
    () =>
      parser.parseURL(
        `https://www.discogs.com/sell/mplistrss?output=rss&&release_id=${releaseId}`,
      ),
    { label: `rss ${releaseId}` },
  );

  return extractMarketplaceListingIds(items);
};
