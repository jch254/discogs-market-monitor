import { Client as DiscogsClient } from 'disconnect';
import { sleep, withRetry, THROTTLE_MS } from './throttle';

export const USER_AGENT = 'MarketMonitor/1.0';

export const getDiscogsClient = () => {
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

  return new DiscogsClient(USER_AGENT, { userToken: token });
};

// Builds a client that acts on behalf of a user who completed the OAuth 1.0a
// flow. Each request is signed with the app's consumer key/secret plus the
// user's access token/secret obtained at authorisation time.
export const getDiscogsClientForOAuth = (
  token: string,
  tokenSecret: string,
) => {
  const consumerKey = process.env.DISCOGS_CONSUMER_KEY;
  const consumerSecret = process.env.DISCOGS_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error(
      'DISCOGS_CONSUMER_KEY and DISCOGS_CONSUMER_SECRET must be set to use OAuth access tokens',
    );
  }

  return new DiscogsClient(USER_AGENT, {
    method: 'oauth',
    consumerKey,
    consumerSecret,
    token,
    tokenSecret,
    level: 2,
  });
};

// Resolves the right client for a registered monitor. Prefers OAuth access
// tokens (full 3-legged auth), then a personal access token, then the shared
// service client for public wantlists.
export const getDiscogsClientForMonitor = (auth: {
  discogsToken?: string;
  discogsOAuthToken?: string;
  discogsOAuthTokenSecret?: string;
}) => {
  if (auth.discogsOAuthToken && auth.discogsOAuthTokenSecret) {
    return getDiscogsClientForOAuth(
      auth.discogsOAuthToken,
      auth.discogsOAuthTokenSecret,
    );
  }

  return getDiscogsClientForToken(auth.discogsToken);
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
