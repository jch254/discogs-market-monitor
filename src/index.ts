import { Context, ScheduledEvent } from "aws-lambda";
import { upperFirst } from "lodash";
import * as Parser from "rss-parser";
import * as sgMail from "@sendgrid/mail";
import { DiscogsUserWantlistMarketplaceItem } from "./interfaces";
import { debugLog, transformListing } from "./utils";
import {
  getDiscogsClient,
  getMarketplaceListings,
  getUserWantlist,
} from "./wrappedDiscogsClient";

const discogsClient = getDiscogsClient();
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
  } = await getUserWantlist(discogsClient, process.env.DISCOGS_USERNAME);

  debugLog("FETCHED USER WANTLIST FROM DISCOGS", {
    username: process.env.DISCOGS_USERNAME,
    itemCount: userWantlist.length,
    requestCount: userWantlistRequestCount,
  });

  if (userWantlist.length === 0) {
    debugLog("EMPTY WANTLIST, EXITING...");
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

  debugLog("FETCHED WANTLIST MARKETPLACE SUMMARY FROM DISCOGS RSS FEED", {
    username: process.env.DISCOGS_USERNAME,
    itemCount: wantlistMarketplaceItems.length,
  });

  if (process.env.LOG_WANTLIST) {
    wantlistMarketplaceItems.forEach((item) => {
      console.log(item.title, item.marketplaceItems);
    });
  }

  const listings = (
    await getMarketplaceListings(discogsClient, wantlistMarketplaceItems)
  ).filter((listing) => {
    const shipsFromList =
      process.env.SHIPS_FROM?.split(",").map((s) => s.trim().toLowerCase()) ||
      [];
    return shipsFromList.includes(listing.ships_from.toLowerCase());
  });

  debugLog("FETCHED WANTLIST MARKETPLACE LISTINGS FROM DISCOGS", {
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

    throw error;
  }
};
