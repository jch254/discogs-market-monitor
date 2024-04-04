import { Context } from "aws-lambda";
import * as Parser from "rss-parser";
import {
  DiscogsUserWantlistMarketplaceItem,
  MarketMonitorEvent,
} from "./interfaces";
import { debugLog } from "./utils";
import {
  getDiscogsClient,
  getMarketplaceListings,
  getUserWantlist,
} from "./wrappedDiscogsClient";
import { sendWantlistEmail } from "./emailClient";

const discogsClient = getDiscogsClient();
const parser = new Parser();

export async function handler(event: MarketMonitorEvent, _context: Context) {
  const { username, shipsFrom, destinationEmail } = event;

  console.log("RUNNING DISCOGS WANTLIST MARKET MONITOR", {
    username,
    shipsFrom,
    destinationEmail,
    senderEmail: process.env.SENDER_EMAIL,
  });

  const {
    wantlistReleases: userWantlist,
    requestCount: userWantlistRequestCount,
  } = await getUserWantlist(discogsClient, username);

  debugLog("FETCHED USER WANTLIST FROM DISCOGS", {
    username,
    itemCount: userWantlist.length,
    requestCount: userWantlistRequestCount,
  });

  if (userWantlist.length === 0) {
    debugLog("EMPTY WANTLIST, EXITING...");
    return;
  }

  const wantlistMarketplaceItems = await getWantlistMarketplaceItems(
    userWantlist
  );

  debugLog("FETCHED WANTLIST MARKETPLACE SUMMARY FROM DISCOGS RSS FEED", {
    username,
    itemCount: wantlistMarketplaceItems.length,
  });

  if (process.env.LOG_WANTLIST) {
    wantlistMarketplaceItems.forEach((item) => {
      console.log(item.title, item.marketplaceItems);
    });
  }

  const shipsFromListings = await getShipsFromListings(
    shipsFrom,
    wantlistMarketplaceItems
  );

  debugLog("FETCHED WANTLIST MARKETPLACE LISTINGS FROM DISCOGS", {
    username,
    itemCount: shipsFromListings.length,
    shipsFrom,
  });

  if (shipsFromListings.length > 0) {
    await sendWantlistEmail(
      destinationEmail,
      username,
      shipsFrom,
      shipsFromListings
    );

    console.log("SUCCESSFULLY SENT WANTLIST MARKETPLACE DIGEST", {
      username,
      shipsFrom,
      destinationEmail,
      senderEmail: process.env.SENDER_EMAIL,
      itemCount: shipsFromListings.length,
    });
  } else {
    console.log(
      "SKIPPING SENDING WANTLIST MARKETPLACE DIGEST AS THERE ARE NO MATCHING LISTINGS",
      {
        username,
        shipsFrom,
      }
    );
  }
}

const getWantlistMarketplaceItems = async (
  userWantlist: WantlistTypes.Want[]
) => {
  return await Promise.all(
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
};

const getShipsFromListings = async (
  shipsFrom: string,
  wantlistMarketplaceItems: DiscogsUserWantlistMarketplaceItem[]
) => {
  return (
    await getMarketplaceListings(discogsClient, wantlistMarketplaceItems)
  ).filter((listing) => {
    const shipsFromList =
      shipsFrom?.split(",").map((s) => s.trim().toLowerCase()) || [];

    return shipsFromList.includes(listing.ships_from.toLowerCase());
  });
};
