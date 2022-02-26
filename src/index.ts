import { Context, ScheduledEvent } from "aws-lambda";
import { Client as DiscogsClient } from "disconnect";
import * as Parser from "rss-parser";
import { sleep } from "./utils";

const discogsClient = new DiscogsClient({
  consumerKey: process.env.DISCOGS_CONSUMER_KEY,
  consumerSecret: process.env.DISCOGS_CONSUMER_SECRET,
  userToken: process.env.DISCOGS_USER_TOKEN,
});

const parser = new Parser();

export async function handler(event: ScheduledEvent, context: Context) {
  console.log("handler");
  console.log("event", JSON.stringify(event));
  console.log("context", JSON.stringify(context));

  const userWantlist = await getUserWantlist(process.env.DISCOGS_USERNAME);
  const wantlistMarketplaceItems = await Promise.all(
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

  console.log(
    `FETCHING ITEMS ON THE DISCOGS MARKETPLACE FOR USER ${process.env.DISCOGS_USERNAME}`
  );

  await sleep(500)
  console.log(".");
  await sleep(500)
  console.log("..");
  await sleep(500)
  console.log("...\n");


  wantlistMarketplaceItems.forEach((item) => {
    console.log(item.title, item.marketplaceItems);
  });
}

const getUserWantlist = async (username?: string) => {
  const wantlist = await discogsClient.user().wantlist();

  let wantlistReleases: WantlistTypes.Want[] = [];
  let totalPages = undefined;
  let currentPage = 1;

  while (!totalPages || currentPage <= totalPages) {
    const { pagination, wants }: WantlistTypes.GetWantlistResponse =
      await wantlist.getReleases(username, {
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


