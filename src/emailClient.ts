import * as sgMail from "@sendgrid/mail";
import { upperFirst } from "lodash";
import { transformListing } from "./utils";

sgMail.setApiKey(process.env.SENDGRID_API_KEY || "");

export const sendWantlistEmail = async (listings: UserTypes.Listing[]) => {
  const msg: sgMail.MailDataRequired = {
    to: process.env.DESTINATION_EMAIL,
    from: process.env.SENDER_EMAIL || "",
    subject: `Discogs Wantlist Digest for ${
      process.env.DISCOGS_USERNAME
    } shipping from ${upperFirst(process.env.SHIPS_FROM)}`,
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
