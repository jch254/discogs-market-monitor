import { Context } from 'aws-lambda';
import { CheckReleaseResult, WantlistReleaseTask } from './interfaces';
import { recordNewListing } from './marketplaceListingStateRepository';
import { getReleaseListingIds } from './marketplaceRss';
import {
  getReleaseCheckState,
  putReleaseCheckState,
} from './releaseCheckStateRepository';
import { debugLog, transformListing } from './utils';
import { getDiscogsClient, getMarketplaceListing } from './wrappedDiscogsClient';

const discogsClient = getDiscogsClient();

// Worker for ONE (userId, releaseId). Idempotent and retry-safe:
// - dedupes against lastSeenListingIds so re-runs surface no duplicates
// - persists the current id set so a retry of this release finds nothing new
// - isolates per-listing failures (one bad listing never fails the release)
export async function handler(
  task: WantlistReleaseTask,
  _context: Context,
): Promise<CheckReleaseResult> {
  const { userId, releaseId, title, shipsFrom } = task;

  const shipsFromList = (shipsFrom ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const state = await getReleaseCheckState(userId, releaseId);
  const previouslySeen = new Set(state?.lastSeenListingIds ?? []);

  const currentListingIds = await getReleaseListingIds(releaseId);
  const newListingIds = currentListingIds.filter(id => !previouslySeen.has(id));

  debugLog('CHECKING RELEASE MARKETPLACE', {
    userId,
    releaseId,
    currentCount: currentListingIds.length,
    newCount: newListingIds.length,
  });

  let newListingCount = 0;
  let currentRequest = 1;

  for (const id of newListingIds) {
    try {
      const listing = await getMarketplaceListing(
        discogsClient,
        id,
        currentRequest,
      );

      if (
        shipsFromList.length === 0 ||
        shipsFromList.includes(listing.ships_from.toLowerCase())
      ) {
        // Write to the notification ledger (un-notified). The conditional put
        // makes this idempotent, so retries never queue a duplicate digest.
        const recorded = await recordNewListing({
          userId,
          listingId: id,
          releaseId,
          listing: transformListing(listing),
        });

        if (recorded) {
          newListingCount += 1;
        }
      }
    } catch (error: any) {
      console.log('FAILED TO FETCH NEW MARKETPLACE LISTING IN WORKER', {
        releaseId,
        id,
        message: error?.message,
      });
    } finally {
      currentRequest += 1;
    }
  }

  // Persist the full current id set last so a retry of this release sees no new
  // ids to re-fetch.
  await putReleaseCheckState({
    userId,
    releaseId,
    lastSeenListingIds: currentListingIds,
  });

  return { releaseId, title, newListingCount };
}
