import { Resend } from 'resend';
import {
  buildDigestHtml,
  buildDigestText,
  escapeHtml,
  formatShipsFrom,
} from './digestEmailTemplate';
import { TransformedListing } from './interfaces';

let resend: Resend;

const getResendClient = () => {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

// Thrown when Resend reports a failed send. The message carries only the
// Resend error *name* (e.g. validation_error): Resend messages can echo the
// destination address, and thrown messages end up in CloudWatch and the Step
// Functions execution history, which must stay free of email addresses.
export class EmailSendError extends Error {
  public readonly resendErrorName: string;

  constructor(emailKind: string, resendErrorName: string | undefined) {
    super(
      `Resend failed to send ${emailKind} email (${resendErrorName ?? 'unknown_error'})`,
    );

    this.name = 'EmailSendError';
    this.resendErrorName = resendErrorName ?? 'unknown_error';
  }
}

// Sends the digest from already-transformed listings. Called by the Step
// Functions SendDigest step from un-notified MarketplaceListingState rows.
// Returns the Resend message id on success; throws EmailSendError on failure
// so the Lambda fails and Step Functions retries (and listings are NOT marked
// notified).
export const sendWantlistDigestEmail = async (
  destinationEmail: string,
  username: string,
  shipsFrom: string,
  listings: TransformedListing[],
): Promise<{ id?: string }> => {
  // The Resend SDK resolves with { data, error } instead of throwing on API
  // errors, so an unchecked await would silently swallow a failed send. Check
  // error explicitly and throw so the caller (and CloudWatch) sees the failure.
  const { data, error } = await getResendClient().emails.send({
    to: destinationEmail,
    from: process.env.SENDER_EMAIL || '',
    subject: `Discogs Wantlist Digest for ${username} shipping from ${formatShipsFrom(
      shipsFrom,
    )}`,
    html: buildDigestHtml(username, shipsFrom, listings),
    text: buildDigestText(username, shipsFrom, listings),
  });

  if (error) {
    throw new EmailSendError('digest', error.name);
  }

  return { id: data?.id };
};

// Sends a one-off confirmation when a monitor is registered/updated via the
// signup API, so the user knows the subscription is active and their email
// address works. Called best-effort from registerMonitor.
export const sendRegistrationConfirmationEmail = async (
  destinationEmail: string,
  username: string,
  shipsFrom: string,
) => {
  const region = formatShipsFrom(shipsFrom);

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#202124;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f5f5;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">
            <tr>
              <td style="background:#ffffff;border:1px solid #e8eaed;border-radius:8px;padding:24px;">
                <h1 style="margin:0 0 12px;font-size:18px;color:#0b8043;">You&rsquo;re all set &#9989;</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Your Discogs wantlist marketplace monitor is active. We&rsquo;ll email this address when new matching listings appear.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:14px;border-collapse:collapse;">
                  <tr><td style="padding:4px 12px 4px 0;color:#5f6368;">Username</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(
                    username,
                  )}</td></tr>
                  <tr><td style="padding:4px 12px 4px 0;color:#5f6368;">Ships from</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(
                    region,
                  )}</td></tr>
                  <tr><td style="padding:4px 12px 4px 0;color:#5f6368;">Digest email</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(
                    destinationEmail,
                  )}</td></tr>
                </table>
                <p style="margin:16px 0 0;font-size:13px;color:#5f6368;line-height:1.5;">Your wantlist is scanned about every 12 hours and you&rsquo;ll only be emailed about newly-seen listings. To change or cancel, visit <a href="https://discogs.603.nz" style="color:#1a0dab;text-decoration:none;">discogs.603.nz</a>.</p>
              </td>
            </tr>
            <tr><td style="padding:8px 0 0;color:#9aa0a6;font-size:12px;text-align:center;">Discogs Wantlist Marketplace Monitor</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "You're all set! Your Discogs wantlist marketplace monitor is active.",
    '',
    `Username:     ${username}`,
    `Ships from:   ${region}`,
    `Digest email: ${destinationEmail}`,
    '',
    "Your wantlist is scanned about every 12 hours; you'll only be emailed about newly-seen listings.",
    'To change or cancel, visit https://discogs.603.nz',
  ].join('\n');

  const { data, error } = await getResendClient().emails.send({
    to: destinationEmail,
    from: process.env.SENDER_EMAIL || '',
    subject: `You're subscribed - Discogs wantlist monitor for ${username}`,
    html,
    text,
  });

  if (error) {
    throw new EmailSendError('confirmation', error.name);
  }

  return { id: data?.id };
};
