import { Context } from 'aws-lambda';
import { sendWantlistDigestEmail } from './emailClient';
import { SendDigestEvent } from './interfaces';
import {
  getUnnotifiedListings,
  markListingsNotified,
} from './marketplaceListingStateRepository';

// Final step of the workflow. Notification is driven entirely by un-notified
// MarketplaceListingState rows (not by recomputation), then those rows are
// marked notified. One aggregated email per run preserves the existing UX, and
// the mark-notified step makes repeated runs idempotent.
export async function handler(event: SendDigestEvent, _context: Context) {
  const { username, shipsFrom, destinationEmail } = event;

  const unnotified = await getUnnotifiedListings(username);

  if (unnotified.length === 0) {
    console.log('NO NEW MATCHING LISTINGS, SKIPPING DIGEST', {
      username,
      shipsFrom,
    });

    return;
  }

  await sendWantlistDigestEmail(
    destinationEmail,
    username,
    shipsFrom,
    unnotified.map(state => state.listing),
  );

  await markListingsNotified(
    username,
    unnotified.map(state => state.listingId),
  );

  console.log('SUCCESSFULLY SENT WANTLIST MARKETPLACE DIGEST', {
    username,
    shipsFrom,
    destinationEmail,
    senderEmail: process.env.SENDER_EMAIL,
    itemCount: unnotified.length,
  });
}
