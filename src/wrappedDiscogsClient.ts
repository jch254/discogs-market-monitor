import { Client as DiscogsClient } from 'disconnect';
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

// Builds a client scoped to a specific user's personal access token. Used so
// each registered monitor reads its own (possibly private) wantlist. Falls back
// to the shared service client when no token is supplied.
export const getDiscogsClientForToken = (token?: string) => {
  if (!token) {
    return getDiscogsClient();
  }

  return new DiscogsClient('MarketMonitor/1.0', { userToken: token });
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
