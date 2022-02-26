import { Context, ScheduledEvent } from "aws-lambda";
import { Client as DiscogsClient } from "disconnect";
import { uniq, upperFirst } from "lodash";
import * as Parser from "rss-parser";
import * as pThrottle from "p-throttle";
import * as sgMail from "@sendgrid/mail";
import { DiscogsUserWantlistMarketplaceItem } from "./interfaces";

const discogsClient = new DiscogsClient('MarketMonitor/1.0', {
  consumerKey: process.env.DISCOGS_CONSUMER_KEY,
  consumerSecret: process.env.DISCOGS_CONSUMER_SECRET,
  userToken: process.env.DISCOGS_USER_TOKEN || "",
});

const parser = new Parser();

sgMail.setApiKey(process.env.SENDGRID_API_KEY || "");

const DISCOGS_REQUESTS_PER_MIN = process.env.DISCOGS_RATE_LIMIT
  ? parseInt(process.env.DISCOGS_RATE_LIMIT, 10)
  : 45;  // 15 request buffer window

export async function handler(_event: ScheduledEvent, _context: Context) {
  console.log("RUNNING DISCOGS WANTLIST MARKET MONITOR", {
    username: process.env.DISCOGS_USERNAME,
    shipsFrom: process.env.SHIPS_FROM,
    destinationEmail: process.env.DESTINATION_EMAIL,
    senderEmail: process.env.SENDER_EMAIL,
    marketplaceListingCap: process.env.MARKETPLACE_LISTING_CAP,
  });

  const userWantlist = await getUserWantlist(process.env.DISCOGS_USERNAME);

  console.log("FETCHED USER WANTLIST FROM DISCOGS", {
    username: process.env.DISCOGS_USERNAME,
    itemCount: userWantlist.length,
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

  return wantlistReleases;
};

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

  // Discogs API requests are throttled by the server by source IP to 60 per minute for authenticated requests
  const getListing = pThrottle(
    async (id: string) => {
      const marketplace = discogsClient.marketplace();
      const listing = await marketplace.getListing(parseInt(id, 10));

      console.log("FETCHED DISCOGS MARKETPLACE LISTING", {
        id,
      });

      return listing;
    },
    DISCOGS_REQUESTS_PER_MIN,
    70 * 1000 // 10 sec buffer window
  );

  return await Promise.all(marketplaceListingIds.slice(0,45).map(getListing));
};

const sendWantlistEmail = async (listings: UserTypes.Listing[]) => {
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
