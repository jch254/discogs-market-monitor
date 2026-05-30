import { Context } from 'aws-lambda';
import { sendWantlistDigestEmail } from './emailClient';
import { SendDigestEvent } from './interfaces';

// Final step of the workflow: aggregate the per-release worker results into a
// single digest email, preserving the existing one-email-per-run UX. Only new
// (deduped) listings reach here, so repeated runs no longer re-send the same
// listings.
export async function handler(event: SendDigestEvent, _context: Context) {
  const { username, shipsFrom, destinationEmail, results } = event;

  const listings = (results ?? []).flatMap(result => result.newListings);

  if (listings.length === 0) {
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
    listings,
  );

  console.log('SUCCESSFULLY SENT WANTLIST MARKETPLACE DIGEST', {
    username,
    shipsFrom,
    destinationEmail,
    senderEmail: process.env.SENDER_EMAIL,
    itemCount: listings.length,
  });
}
