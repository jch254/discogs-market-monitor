import { Context } from "aws-lambda";
import { Client as DiscogsClient } from "disconnect";
import { uniq, upperFirst } from "lodash";
import * as Parser from "rss-parser";
import * as sgMail from "@sendgrid/mail";
import {
  DiscogsUserWantlistMarketplaceItem,
  MonitorEvent,
  TransformedListing,
} from "./interfaces";
import { sleep } from "./utils";
import { MAX_REQUESTS, USER_AGENT } from "./constants";
import { RequestsExceededError } from "./RequestsExceededError";

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

const parser = new Parser();

sgMail.setApiKey(process.env.SENDGRID_API_KEY || "");

export async function handler(event: MonitorEvent, _context: Context) {
  console.log(event);

  console.log("RUNNING DISCOGS WANTLIST MARKET MONITOR", {
    username: process.env.DISCOGS_USERNAME,
    shipsFrom: process.env.SHIPS_FROM,
    destinationEmail: process.env.DESTINATION_EMAIL,
    senderEmail: process.env.SENDER_EMAIL,
  });

  const {
    wantlistReleases: userWantlist,
    requestCount: userWantlistRequestCount,
  } = await getUserWantlist(process.env.DISCOGS_USERNAME);

  console.log("FETCHED USER WANTLIST FROM DISCOGS", {
    username: process.env.DISCOGS_USERNAME,
    itemCount: userWantlist.length,
    requestCount: userWantlistRequestCount,
  });

  if (userWantlist.length === 0) {
    return;
  }

  const wantlistMarketplaceItems: DiscogsUserWantlistMarketplaceItem[] =
    await Promise.all(
      userWantlist.map(async (item) => {
        const title = `${item.basic_information.artists
          .map((artist) => artist.name)
          .join(", ")} - ${item.basic_information.title}`;

        const { items: marketplaceItems } = await parser.parseURL(
          `https://www.discogs.com/sell/mplistrss?output=rss&&release_id=${item.basic_information.id}`
        );

        return { title, marketplaceItems };
      })
    );

  console.log("FETCHED WANTLIST MARKETPLACE SUMMARY FROM DISCOGS RSS FEED", {
    username: process.env.DISCOGS_USERNAME,
    itemCount: wantlistMarketplaceItems.length,
  });

  if (process.env.LOG_WANTLIST) {
    wantlistMarketplaceItems.forEach((item) => {
      console.log(item.title, item.marketplaceItems);
    });
  }

  // Sleep for number of requests it took to fetch wantlist to reset rate limit
  await sleep(userWantlistRequestCount * 1000);

  let listings: UserTypes.Listing[] = [];

  try {
    listings = [
      ...(await getMarketplaceListings(wantlistMarketplaceItems, event)).filter(
        (listing) =>
          listing.ships_from.toLowerCase() ===
          process.env.SHIPS_FROM?.toLowerCase()
      ),
    ];
  } catch (error) {
    const requestError: RequestsExceededError = error as RequestsExceededError;

    if (requestError.name === "RequestsExceededError") {
      console.log(
        "REACHED MAX REQUESTS FOR LAMBDA RUN. TRIGGERING NEXT RUN...",
        {
          currentIndex: requestError.currentIndex,
        }
      );

      return {
        runRepeat: true,
        currentIndex: requestError.currentIndex,
        currentListings: requestError.currentListings.filter(
          (listing) =>
            listing.shipsFrom.toLowerCase() ===
            process.env.SHIPS_FROM?.toLowerCase()
        ),
      };
    }
  }

  const currentListings = event.data.currentListings
  const itemCount = listings.length + currentListings.length;

  console.log("FETCHED WANTLIST MARKETPLACE LISTINGS FROM DISCOGS", {
    username: process.env.DISCOGS_USERNAME,
    itemCount,
    shipsFrom: process.env.SHIPS_FROM,
  });

  if (itemCount > 0) {
    await sendWantlistEmail([
      ...currentListings,
      ...listings.map(transformListing),
    ]);

    console.log("SUCCESSFULLY SENT WANTLIST MARKETPLACE DIGEST", {
      username: process.env.DISCOGS_USERNAME,
      shipsFrom: process.env.SHIPS_FROM,
      destinationEmail: process.env.DESTINATION_EMAIL,
      senderEmail: process.env.SENDER_EMAIL,
      itemCount,
    });
  } else {
    console.log(
      "SKIPPING SENDING WANTLIST MARKETPLACE DIGEST AS THERE ARE NO MATCHING LISTINGS",
      {
        username: process.env.DISCOGS_USERNAME,
        shipsFrom: process.env.SHIPS_FROM,
      }
    );
  }

  return;
}

const getUserWantlist = async (username?: string) => {
  const wantlist = discogsClient.user().wantlist();

  let wantlistReleases: WantlistTypes.Want[] = [];
  let totalPages = undefined;
  let currentPage = 1;

  while (!totalPages || currentPage <= totalPages) {
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

const getMarketplaceListing = async (id: string, currentRequest: number) => {
  const marketplace = discogsClient.marketplace();

  const listing = await marketplace.getListing(parseInt(id, 10));

  console.log("FETCHED DISCOGS MARKETPLACE LISTING", {
    id,
    currentRequest,
  });

  return listing;
};

const snooze = async (index: number) => {
  if (index !== 0 && index % 30 === 0) {
    console.log("SLEEPING FOR 30 SECONDS AFTER FETCHING 30 ITEMS...");

    await sleep(30 * 1000);
  }
};

const getMarketplaceListings = async (
  wantlistMarketplaceItems: DiscogsUserWantlistMarketplaceItem[],
  event: MonitorEvent
) => {
  let marketplaceListingIds = uniq(
    wantlistMarketplaceItems.flatMap((item) =>
      item.marketplaceItems.map((marketplaceItem) => {
        if (marketplaceItem.link) {
          return marketplaceItem.link.split("/").pop();
        } else if (marketplaceItem.id) {
          return marketplaceItem.id.split("/").pop();
        }
      })
    )
  );

  const { data: { runRepeat, currentIndex } } = event

  let currentRequest = 1;
  const listings: UserTypes.Listing[] = [];

  if (runRepeat) {
    // Skip requests that has been made in previous runs
    marketplaceListingIds = marketplaceListingIds.slice(currentIndex);
  }

  for await (const [index, id] of marketplaceListingIds.entries()) {
    // Discogs API requests are throttled by the server by source IP to 60 per minute for authenticated requests

    if (index > MAX_REQUESTS) {
      throw new RequestsExceededError(
        "EXCEEDED MAX REQUESTS",
        index,
        listings.map(transformListing)
      );
    }

    try {
      const listing = await getMarketplaceListing(id, currentRequest);

      currentRequest += 1;
      listings.push(listing);

      await snooze(index);
    } catch {
      // TODO: Determine if rate limiting error
      console.log(
        "FUCK! HIT DISCOGS RATE LIMITING ERROR. SLEEPING FOR 5 SECONDS...",
        {
          id,
          currentRequest,
        }
      );

      await sleep(5 * 1000);

      const listing = await getMarketplaceListing(id, currentRequest);

      currentRequest += 1;
      listings.push(listing);

      await snooze(index);
    }
  }

  return listings;
};

const sendWantlistEmail = async (listings: TransformedListing[]) => {
  const msg: sgMail.MailDataRequired = {
    to: process.env.DESTINATION_EMAIL,
    from: process.env.SENDER_EMAIL || "",
    subject: `Discogs Wantlist Digest for ${
      process.env.DISCOGS_USERNAME
    } shipping from ${upperFirst(process.env.SHIPS_FROM)}`,
    text: JSON.stringify(listings, undefined, 2),
  };

  try {
    await sgMail.send(msg);
  } catch (error: any) {
    console.error(error);

    if (error.response) {
      console.error(error.response.body);
    }
  }
};

const transformListing = (listing: UserTypes.Listing): TransformedListing => {
  return {
    artist: listing.release.artist,
    title: listing.release.title,
    price: `${listing.price.value} ${listing.price.currency}`,
    shippingPrice: `${listing.shipping_price.value} ${listing.shipping_price.currency}`,
    uri: listing.uri,
    condition: listing.condition,
    sleeveCondition: listing.sleeve_condition,
    comments: listing.comments,
    posted: listing.posted,
    description: listing.release.description,
    format: listing.release.format,
    year: listing.release.year,
    shipsFrom: listing.ships_from,
  };
};
