import { Context } from 'aws-lambda';
import Parser from 'rss-parser';
import { sendWantlistEmail } from './emailClient';
import {
  DiscogsUserWantlistMarketplaceItem,
  MarketMonitorEvent,
} from './interfaces';
import {
  getReleaseCheckState,
  putReleaseCheckState,
  wasCheckedRecently,
} from './releaseCheckStateRepository';
import { sleep, withRetry, THROTTLE_MS } from './throttle';
import { debugLog, extractMarketplaceListingIds } from './utils';
import {
  getDiscogsClient,
  getMarketplaceListings,
  getUserWantlist,
} from './wrappedDiscogsClient';

const discogsClient = getDiscogsClient();
const parser = new Parser();

export async function handler(event: MarketMonitorEvent, _context: Context) {
  const { username, shipsFrom, destinationEmail } = event;

  console.log('RUNNING DISCOGS WANTLIST MARKET MONITOR', {
    username,
    shipsFrom,
    destinationEmail,
    senderEmail: process.env.SENDER_EMAIL,
  });

  const {
    wantlistReleases: userWantlist,
    requestCount: userWantlistRequestCount,
  } = await getUserWantlist(discogsClient, username);

  debugLog('FETCHED USER WANTLIST FROM DISCOGS', {
    username,
    itemCount: userWantlist.length,
    requestCount: userWantlistRequestCount,
  });

  if (userWantlist.length === 0) {
    debugLog('EMPTY WANTLIST, EXITING...');
    return;
  }

  const wantlistMarketplaceItems = await getWantlistMarketplaceItems(
    username,
    userWantlist,
  );

  debugLog('FETCHED WANTLIST MARKETPLACE SUMMARY FROM DISCOGS RSS FEED', {
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
    wantlistMarketplaceItems,
  );

  debugLog('FETCHED WANTLIST MARKETPLACE LISTINGS FROM DISCOGS', {
    username,
    itemCount: shipsFromListings.length,
    shipsFrom,
  });

  if (shipsFromListings.length > 0) {
    await sendWantlistEmail(
      destinationEmail,
      username,
      shipsFrom,
      shipsFromListings,
    );

    console.log('SUCCESSFULLY SENT WANTLIST MARKETPLACE DIGEST', {
      username,
      shipsFrom,
      destinationEmail,
      senderEmail: process.env.SENDER_EMAIL,
      itemCount: shipsFromListings.length,
    });
  } else {
    console.log(
      'SKIPPING SENDING WANTLIST MARKETPLACE DIGEST AS THERE ARE NO MATCHING LISTINGS',
      {
        username,
        shipsFrom,
      },
    );
  }
}

const getWantlistMarketplaceItems = async (
  username: string,
  userWantlist: WantlistTypes.Want[],
) => {
  const items: DiscogsUserWantlistMarketplaceItem[] = [];

  // Sequential processing with a fixed throttle between each RSS fetch. The
  // previous Promise.all fanned out an uncontrolled request per wantlist item,
  // which tripped Discogs rate limiting and timed the Lambda out.
  for (const item of userWantlist) {
    const releaseId = item.basic_information.id;
    const title = `${item.basic_information.artists
      .map(artist => artist.name)
      .join(', ')} - ${item.basic_information.title}`;

    // Skip releases checked recently to avoid recomputing the full wantlist on
    // frequent re-runs. On the normal 12h schedule nothing is skipped.
    const state = await getReleaseCheckState(username, releaseId);

    if (wasCheckedRecently(state)) {
      debugLog('SKIPPING RECENTLY CHECKED RELEASE', {
        username,
        releaseId,
        lastCheckedAt: state?.lastCheckedAt,
      });

      continue;
    }

    await sleep(THROTTLE_MS);

    try {
      const { items: marketplaceItems } = await withRetry(
        () =>
          parser.parseURL(
            `https://www.discogs.com/sell/mplistrss?output=rss&&release_id=${releaseId}`,
          ),
        { label: `rss ${releaseId}` },
      );

      items.push({ title, marketplaceItems });

      await putReleaseCheckState({
        userId: username,
        releaseId,
        lastSeenListingIds: extractMarketplaceListingIds(marketplaceItems),
      });
    } catch (error: any) {
      console.log('FAILED TO FETCH MARKETPLACE RSS FEED', {
        releaseId,
        title,
        message: error?.message,
      });
    }
  }

  return items;
};

const getShipsFromListings = async (
  shipsFrom: string,
  wantlistMarketplaceItems: DiscogsUserWantlistMarketplaceItem[],
) => {
  return (
    await getMarketplaceListings(discogsClient, wantlistMarketplaceItems)
  ).filter((listing) => {
    const shipsFromList =
      shipsFrom?.split(',').map(s => s.trim().toLowerCase()) || [];

    return shipsFromList.includes(listing.ships_from.toLowerCase());
  });
};
