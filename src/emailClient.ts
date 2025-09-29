import * as sgMail from '@sendgrid/mail';
import { upperFirst } from 'lodash';
import { transformListing } from './utils';

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

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

  const msg: sgMail.MailDataRequired = {
    to: destinationEmail,
    from: process.env.SENDER_EMAIL || '',
    subject: `Discogs Wantlist Digest for ${username} shipping from ${shipsFromList}`,
    text: JSON.stringify(listings.map(transformListing), undefined, 2),
  };

  try {
    await sgMail.send(msg);
  } catch (error: any) {
    console.error(error);

    if (error.response) {
      console.error(error.response.body);
    }

    throw error;
  }
};
