import { Client as DiscogsClient } from 'disconnect';
import { uniq } from 'lodash';
import { DiscogsUserWantlistMarketplaceItem } from './interfaces';
import { sleep, withRetry, THROTTLE_MS } from './throttle';

export const getDiscogsClient = () => {
  const USER_AGENT = 'MarketMonitor/1.0';

  let discogsClient: DiscogsClient;

  if (process.env.DISCOGS_USER_TOKEN) {
    discogsClient = new DiscogsClient(USER_AGENT, {
      userToken: process.env.DISCOGS_USER_TOKEN,
    });
  } else if (
    process.env.DISCOGS_CONSUMER_KEY &&
    process.env.DISCOGS_CONSUMER_SECRET
  ) {
    discogsClient = new DiscogsClient(USER_AGENT, {
      consumerKey: process.env.DISCOGS_CONSUMER_KEY,
      consumerSecret: process.env.DISCOGS_CONSUMER_SECRET,
    });
  } else {
    discogsClient = new DiscogsClient(USER_AGENT);
  }

  return discogsClient;
};

export const getUserWantlist = async (
  discogsClient: DiscogsClient,
  username?: string,
) => {
  const wantlist = discogsClient.user().wantlist();

  let wantlistReleases: WantlistTypes.Want[] = [];
  let totalPages = undefined;
  let currentPage = 1;

  while (!totalPages || currentPage <= totalPages) {
    await sleep(THROTTLE_MS);

    const { pagination, wants }: WantlistTypes.GetWantlistResponse =
      await withRetry(
        () =>
          wantlist.getReleases(username || '', {
            page: currentPage,
            per_page: 100,
          }),
        { label: `wantlist page ${currentPage}` },
      );

    if (!totalPages) {
      totalPages = pagination.pages;
    }

    wantlistReleases = [...wantlistReleases, ...wants];

    currentPage += 1;
  }

  return { wantlistReleases, requestCount: totalPages };
};

export const getMarketplaceListings = async (
  discogsClient: DiscogsClient,
  wantlistMarketplaceItems: DiscogsUserWantlistMarketplaceItem[],
) => {
  const marketplaceListingIds: string[] = uniq(
    wantlistMarketplaceItems.flatMap(item =>
      item.marketplaceItems.map((marketplaceItem) => {
        const source = marketplaceItem.link ?? marketplaceItem.id;

        return typeof source === 'string' ? source.split('/').pop() : undefined;
      }),
    ),
    // Drop undefined/empty values and keep only valid numeric listing ids so
    // downstream parseInt always receives a usable string.
  ).filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id));

  let currentRequest = 1;
  const listings: UserTypes.Listing[] = [];

  // Sequential processing with a fixed throttle between calls. No Promise.all /
  // uncontrolled parallel fan-out. Each listing is isolated so one failure does
  // not abort the whole batch.
  for (const id of marketplaceListingIds) {
    await sleep(THROTTLE_MS);

    try {
      const listing = await getMarketplaceListing(
        discogsClient,
        id,
        currentRequest,
      );

      listings.push(listing);
    } catch (error: any) {
      console.log('FAILED TO FETCH DISCOGS MARKETPLACE LISTING', {
        id,
        currentRequest,
        statusCode: error?.statusCode,
        message: error?.message,
      });
    } finally {
      currentRequest += 1;
    }
  }

  return listings;
};

export const getMarketplaceListing = async (
  discogsClient: DiscogsClient,
  id: string,
  currentRequest: number,
) => {
  const listing = await withRetry(
    () => getListingAsync(discogsClient, parseInt(id, 10)),
    { label: `listing ${id}` },
  );

  console.log('FETCHED DISCOGS MARKETPLACE LISTING', {
    id,
    currentRequest,
  });

  return listing;
};

const getListingAsync = (
  discogsClient: DiscogsClient,
  id: number,
): Promise<UserTypes.Listing> => {
  return new Promise((resolve, reject) => {
    discogsClient.marketplace().getListing(id, (err, data, rateLimit) => {
      if (err && err !== null) {
        err.rateLimit = rateLimit;
        reject(err);
      } else if (data === null) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};
