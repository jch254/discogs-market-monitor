import { Context } from 'aws-lambda';
import { CheckReleaseResult, WantlistReleaseTask } from './interfaces';
import { logEvent } from './log';
import { recordNewListing } from './marketplaceListingStateRepository';
import { getReleaseListingIds } from './marketplaceRss';
import {
  getReleaseCheckState,
  putReleaseCheckState,
  wasCheckedRecently,
} from './releaseCheckStateRepository';
import { isScraperError } from './scraperError';
import { transformListing } from './utils';
import { getDiscogsClient, getMarketplaceListing } from './wrappedDiscogsClient';

const discogsClient = getDiscogsClient();

// Worker for ONE (userId, releaseId). Idempotent and retry-safe:
// - dedupes against lastSeenListingIds so re-runs surface no duplicates
// - persists the current id set so a retry of this release finds nothing new
// - isolates per-listing failures (one bad listing never fails the release)
//
// Failure semantics: ReleaseCheckState is only written after the sell page was
// actually fetched and parsed. A blocked/timed-out/challenged/unparseable
// scrape throws instead, so the release is never recorded as "successfully
// checked, no listings" and is naturally retried (Step Functions retry now, or
// the next scheduled run). A genuine zero-listing sell page IS a successful
// check.
export async function handler(
  task: WantlistReleaseTask,
  context: Context,
): Promise<CheckReleaseResult> {
  const { userId, releaseId, title, shipsFrom } = task;

  const shipsFromList = (shipsFrom ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const state = await getReleaseCheckState(userId, releaseId);

  if (wasCheckedRecently(state)) {
    logEvent('release_check_recently_checked_skip', {
      userId,
      releaseId,
      lastCheckedAt: state?.lastCheckedAt,
      lambdaRequestId: context?.awsRequestId,
    });

    return { releaseId, title, newListingCount: 0 };
  }

  logEvent('release_check_started', {
    userId,
    releaseId,
    lambdaRequestId: context?.awsRequestId,
  });

  const previouslySeen = new Set(state?.lastSeenListingIds ?? []);

  let currentListingIds: string[];

  try {
    currentListingIds = await getReleaseListingIds(releaseId);
  } catch (error: any) {
    const failureFields = isScraperError(error)
      ? error.toLogFields()
      : {
        releaseId,
        errorType: 'unexpected',
        reason: String(error?.message ?? error).slice(0, 200),
      };

    logEvent('release_check_failed', {
      userId,
      lambdaRequestId: context?.awsRequestId,
      ...failureFields,
    });

    // Let this Map item fail: the run tolerates a bounded percentage of these,
    // and ReleaseCheckState was not touched so a future run retries cleanly.
    throw error;
  }

  const newListingIds = currentListingIds.filter(id => !previouslySeen.has(id));

  let newListingCount = 0;
  let currentRequest = 1;
  const failedListingIds = new Set<string>();

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
      // Isolated per-listing failure: don't fail the release, but also don't
      // persist this id as seen, so the next run retries just this listing.
      failedListingIds.add(id);

      console.log('FAILED TO FETCH NEW MARKETPLACE LISTING IN WORKER', {
        releaseId,
        id,
        message: error?.message,
      });
    } finally {
      currentRequest += 1;
    }
  }

  // Persist the current id set (minus listings whose detail fetch failed) last,
  // so a retry of this release only re-fetches what actually needs it.
  await putReleaseCheckState({
    userId,
    releaseId,
    lastSeenListingIds: currentListingIds.filter(
      id => !failedListingIds.has(id),
    ),
  });

  logEvent('release_check_success', {
    userId,
    releaseId,
    listingIdCount: currentListingIds.length,
    newListingCount,
    failedListingFetchCount: failedListingIds.size,
    lambdaRequestId: context?.awsRequestId,
  });

  return { releaseId, title, newListingCount };
}
