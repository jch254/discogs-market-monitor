import { Resend } from 'resend';
import { upperFirst } from 'lodash';
import { transformListing } from './utils';

let resend: Resend;

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
  const shipsFromList = shipsFrom
    .split(',')
    .map(s => upperFirst(s.trim()))
    .join(', ');

  try {
    await getResendClient().emails.send({
      to: destinationEmail,
      from: process.env.SENDER_EMAIL || '',
      subject: `Discogs Wantlist Digest for ${username} shipping from ${shipsFromList}`,
      text: JSON.stringify(listings.map(transformListing), undefined, 2),
    });
  } catch (error: any) {
    console.error(error);
    throw error;
  }
};
