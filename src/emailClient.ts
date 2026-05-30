import { Resend } from 'resend';
import { upperFirst } from 'lodash';
import { TransformedListing } from './interfaces';

let resend: Resend;

const formatShipsFrom = (shipsFrom: string) =>
  shipsFrom
    .split(',')
    .map(s => upperFirst(s.trim()))
    .join(', ');

const getResendClient = () => {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

// Sends the digest from already-transformed listings. Called by the Step
// Functions SendDigest step from un-notified MarketplaceListingState rows.
export const sendWantlistDigestEmail = async (
  destinationEmail: string,
  username: string,
  shipsFrom: string,
  listings: TransformedListing[],
) => {
  try {
    await getResendClient().emails.send({
      to: destinationEmail,
      from: process.env.SENDER_EMAIL || '',
      subject: `Discogs Wantlist Digest for ${username} shipping from ${formatShipsFrom(
        shipsFrom,
      )}`,
      text: JSON.stringify(listings, undefined, 2),
    });
  } catch (error: any) {
    console.error(error);
    throw error;
  }
};
