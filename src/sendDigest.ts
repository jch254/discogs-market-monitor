import { Context } from 'aws-lambda';
import { sendWantlistDigestEmail } from './emailClient';
import { SendDigestEvent } from './interfaces';
import { logEvent } from './log';
import {
  getUnnotifiedListings,
  markListingsNotified,
} from './marketplaceListingStateRepository';

// Final step of the workflow. Notification is driven entirely by un-notified
// MarketplaceListingState rows (not by recomputation or Map output), then
// those rows are marked notified. One aggregated email per run preserves the
// existing UX, and the mark-notified step makes repeated runs idempotent.
//
// Ordering is load-bearing: listings are marked notified strictly AFTER Resend
// confirms the send. A failed send throws, the Lambda fails, Step Functions
// retries, and every listing is still un-notified, so nothing is dropped. If
// the send succeeds but marking fails, a retry re-emails the same listings
// (duplicate digest) rather than ever losing one - the safe direction.
export async function handler(event: SendDigestEvent, context: Context) {
  const { username, shipsFrom, destinationEmail } = event;

  const unnotified = await getUnnotifiedListings(username);

  if (unnotified.length === 0) {
    console.log('NO NEW MATCHING LISTINGS, SKIPPING DIGEST', {
      username,
      shipsFrom,
    });

    return;
  }

  logEvent('digest_send_attempted', {
    userId: username,
    listingIdCount: unnotified.length,
    lambdaRequestId: context?.awsRequestId,
  });

  let resendId: string | undefined;

  try {
    const { id } = await sendWantlistDigestEmail(
      destinationEmail,
      username,
      shipsFrom,
      unnotified.map(state => state.listing),
    );

    resendId = id;
  } catch (error: any) {
    logEvent('digest_send_failed', {
      userId: username,
      listingIdCount: unnotified.length,
      errorType: 'email_send',
      resendErrorName: error?.resendErrorName,
      lambdaRequestId: context?.awsRequestId,
    });

    // Fail the Lambda so Step Functions retries; listings stay un-notified.
    throw error;
  }

  logEvent('digest_send_succeeded', {
    userId: username,
    listingIdCount: unnotified.length,
    resendId,
    lambdaRequestId: context?.awsRequestId,
  });

  logEvent('digest_mark_notified_started', {
    userId: username,
    listingIdCount: unnotified.length,
    lambdaRequestId: context?.awsRequestId,
  });

  await markListingsNotified(
    username,
    unnotified.map(state => state.listingId),
  );

  logEvent('digest_mark_notified_succeeded', {
    userId: username,
    listingIdCount: unnotified.length,
    lambdaRequestId: context?.awsRequestId,
  });
}
