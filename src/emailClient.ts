import { Resend } from 'resend';
import { upperFirst } from 'lodash';
import { TransformedListing } from './interfaces';
import { transformListing } from './utils';

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

export const sendWantlistEmail = async (
  destinationEmail: string,
  username: string,
  shipsFrom: string,
  listings: UserTypes.Listing[],
) => {
  return sendWantlistDigestEmail(
    destinationEmail,
    username,
    shipsFrom,
    listings.map(transformListing),
  );
};

// Sends the same digest from already-transformed listings (used by the Step
// Functions SendDigest step, which aggregates per-release worker results).
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
