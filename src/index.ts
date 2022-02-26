import { Context, ScheduledEvent } from "aws-lambda";
import { Client as DiscogsClient } from "disconnect";
import { DiscogsPagination, DiscogsWantlistItem } from "./interfaces";

const discogsClient = new DiscogsClient({
  consumerKey: process.env.DISCOGS_CONSUMER_KEY,
  consumerSecret: process.env.DISCOGS_CONSUMER_SECRET,
  userToken: process.env.DISCOGS_USER_TOKEN,
});

export async function handler(event: ScheduledEvent, context: Context) {
  console.log("handler");
  console.log("event", JSON.stringify(event));
  console.log("context", JSON.stringify(context));

  const wantlist = await discogsClient.user().wantlist();

  let wantlistReleases: DiscogsWantlistItem[] = [];
  let totalPages = undefined;
  let currentPage = 1;

  while (!totalPages || currentPage <= totalPages) {
    const {
      pagination,
      wants,
    }: { pagination: DiscogsPagination; wants: DiscogsWantlistItem[] } =
      await wantlist.getReleases(process.env.DISCOGS_USERNAME, {
        page: currentPage,
        per_page: 100,
      });

    if (!totalPages) {
      totalPages = pagination.pages;
    }

    wantlistReleases = [...wantlistReleases, ...wants];

    currentPage += 1;
  }

  console.log(
    "Current wantlist item",
    JSON.stringify(
      wantlistReleases.map(
        (item) =>
          `${item.basic_information.artists
            .map((artist) => artist.name)
            .join(", ")} - ${item.basic_information.title}`
      ),
      undefined,
      "\r"
    )
  );
}
