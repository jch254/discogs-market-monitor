import { Client as DiscogsClient } from "disconnect";
import { DiscogsUserWantlistMarketplaceItem } from "./interfaces";
import { uniq } from "lodash";
import { LeakyBucket } from "./LeakyBucket/leakyBucket";

// Discogs API requests are throttled by the server by source IP to 60 per minute for authenticated requests
// Setting capacity of 55 requests for a buffer of 5 requests
// TODO: Fine tune buffer
const bucket = new LeakyBucket({
  initialCapacity: 0,
  capacity: 55,
  interval: 60,
  timeout: 900,
});

export const getDiscogsClient = () => {
  const USER_AGENT = "MarketMonitor/1.0";

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
  username?: string
) => {
  const wantlist = discogsClient.user().wantlist();

  let wantlistReleases: WantlistTypes.Want[] = [];
  let totalPages = undefined;
  let currentPage = 1;

  while (!totalPages || currentPage <= totalPages) {
    await bucket.throttle();

    const { pagination, wants }: WantlistTypes.GetWantlistResponse =
      await wantlist.getReleases(username || "", {
        page: currentPage,
        per_page: 100,
      });

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
  wantlistMarketplaceItems: DiscogsUserWantlistMarketplaceItem[]
) => {
  const marketplaceListingIds = uniq(
    wantlistMarketplaceItems.splice(5).flatMap((item) =>
      item.marketplaceItems.map((marketplaceItem) => {
        if (marketplaceItem.link) {
          return marketplaceItem.link.split("/").pop();
        } else if (marketplaceItem.id) {
          return marketplaceItem.id.split("/").pop();
        }
      })
    )
  );

  let currentRequest = 1;
  const listings: UserTypes.Listing[] = [];

  for await (const [_index, id] of marketplaceListingIds.entries()) {
    try {
      const listing = await getMarketplaceListing(
        discogsClient,
        id,
        currentRequest
      );

      currentRequest += 1;
      listings.push(listing);
    } catch (error: any) {
      console.log(error);

      if (error.statusCode === 429) {
        console.log("FUCK!!! HIT DISCOGS RATE LIMITING ERROR.", {
          id,
          currentRequest,
          rateLimit: error.rateLimit,
        });
      }
    }
  }

  return listings;
};

export const getMarketplaceListing = async (
  discogsClient: DiscogsClient,
  id: string,
  currentRequest: number
) => {
  const listing = await getListingAsync(discogsClient, parseInt(id, 10));

  console.log("FETCHED DISCOGS MARKETPLACE LISTING", {
    id,
    currentRequest,
  });

  return listing;
};

const getListingAsync = async (
  discogsClient: DiscogsClient,
  id: number
): Promise<UserTypes.Listing> => {
  return new Promise(async (resolve, reject) => {
    await bucket.throttle();

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
