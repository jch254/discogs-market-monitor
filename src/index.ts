import { Context, ScheduledEvent } from "aws-lambda";
import { Client as DiscogsClient } from "disconnect";
import { uniq, upperFirst } from "lodash";
import * as Parser from "rss-parser";
import * as sgMail from "@sendgrid/mail";
import { DiscogsUserWantlistMarketplaceItem, TransformedListing } from "./interfaces";
import { sleep } from "./utils";

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

const parser = new Parser();

sgMail.setApiKey(process.env.SENDGRID_API_KEY || "");

export async function handler(_event: ScheduledEvent, _context: Context) {
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

  const listings = (
    await getMarketplaceListings(wantlistMarketplaceItems)
  ).filter(
    (listing) =>
      listing.ships_from.toLowerCase() === process.env.SHIPS_FROM?.toLowerCase()
  );

  console.log("FETCHED WANTLIST MARKETPLACE LISTINGS FROM DISCOGS", {
    username: process.env.DISCOGS_USERNAME,
    itemCount: listings.length,
    shipsFrom: process.env.SHIPS_FROM,
  });

  if (listings.length > 0) {
    await sendWantlistEmail(listings);

    console.log("SUCCESSFULLY SENT WANTLIST MARKETPLACE DIGEST", {
      username: process.env.DISCOGS_USERNAME,
      shipsFrom: process.env.SHIPS_FROM,
      destinationEmail: process.env.DESTINATION_EMAIL,
      senderEmail: process.env.SENDER_EMAIL,
      itemCount: listings.length,
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

const snooze = async (index:number) => {
  if (index !== 0 && index % 30 === 0) {
    console.log("SLEEPING FOR 30 SECONDS AFTER FETCHING 30 ITEMS...");

    await sleep(30 * 1000);
  }
}

const getMarketplaceListings = async (
  wantlistMarketplaceItems: DiscogsUserWantlistMarketplaceItem[]
) => {
  const marketplaceListingIds = uniq(
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

  let currentRequest = 1;
  const listings: UserTypes.Listing[] = [];

  for await (const [index, id] of marketplaceListingIds.entries()) {
    // Discogs API requests are throttled by the server by source IP to 60 per minute for authenticated requests

    try {
      const listing = await getMarketplaceListing(id, currentRequest);

      currentRequest += 1;
      listings.push(listing);

      await snooze(index)
    } catch {
      // TODO: Determine if rate limiting error
      console.log(
        "FUCK!! HIT DISCOGS RATE LIMITING ERROR. SLEEPING FOR 5 SECONDS...",
        {
          id,
          currentRequest,
        }
      );

      await sleep(5 * 1000);

      const listing = await getMarketplaceListing(id, currentRequest);

      currentRequest += 1;
      listings.push(listing);

      await snooze(index)
    }
  }

  return listings;
};

const sendWantlistEmail = async (listings: UserTypes.Listing[]) => {
  const msg: sgMail.MailDataRequired = {
    to: process.env.DESTINATION_EMAIL,
    from: process.env.SENDER_EMAIL || "",
    subject: `Discogs Wantlist Digest for ${
      process.env.DISCOGS_USERNAME
    } shipping from ${upperFirst(process.env.SHIPS_FROM)}`,
    text: JSON.stringify(listings.map(transformListing), undefined, 2),
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
  }
}
