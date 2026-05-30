import { upperFirst } from 'lodash';
import { TransformedListing } from './interfaces';

// Builds the digest email body. Marketplace data (titles, comments, seller
// text) is untrusted, so every interpolated value is HTML-escaped and every
// URL is validated before it is rendered into the template.

const DISCOGS_BASE_URL = 'https://www.discogs.com';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Only http(s) URLs are allowed through; anything else (e.g. javascript:)
// collapses to undefined so it is simply not rendered as a link/image.
const safeHttpUrl = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value, DISCOGS_BASE_URL);

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
};

const listingUrl = (listing: TransformedListing): string | undefined =>
  safeHttpUrl(listing.uri);

const releaseUrl = (listing: TransformedListing): string | undefined =>
  listing.releaseId
    ? `${DISCOGS_BASE_URL}/release/${listing.releaseId}`
    : undefined;

export const formatShipsFrom = (shipsFrom: string): string =>
  shipsFrom
    .split(',')
    .map(s => upperFirst(s.trim()))
    .filter(Boolean)
    .join(', ');

const formatPosted = (posted: string): string => {
  const date = new Date(posted);

  if (Number.isNaN(date.getTime())) {
    return posted;
  }

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatPrice = (listing: TransformedListing): string => {
  const hasShipping =
    listing.shippingPrice && listing.shippingPrice !== 'TBC';

  return hasShipping
    ? `${listing.price} + ${listing.shippingPrice} shipping`
    : `${listing.price} + shipping TBC`;
};

const renderChip = (label: string, value?: string | number): string => {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return `<span style="display:inline-block;background:#f1f3f4;color:#202124;border-radius:12px;padding:3px 10px;font-size:12px;margin:0 6px 6px 0;">${escapeHtml(
    `${label}: ${value}`,
  )}</span>`;
};

const renderListingCard = (listing: TransformedListing): string => {
  const title = escapeHtml(`${listing.artist} \u2013 ${listing.title}`);
  const primaryUrl = releaseUrl(listing) ?? listingUrl(listing);
  const thumbnail = safeHttpUrl(listing.thumbnail);
  const listingHref = listingUrl(listing);

  const titleHtml = primaryUrl
    ? `<a href="${primaryUrl}" style="color:#1a0dab;text-decoration:none;">${title}</a>`
    : title;

  const imageHtml = thumbnail
    ? `<img src="${thumbnail}" alt="${title}" width="96" height="96" style="display:block;width:96px;height:96px;object-fit:cover;border-radius:6px;border:1px solid #e0e0e0;" />`
    : `<div style="width:96px;height:96px;border-radius:6px;border:1px solid #e0e0e0;background:#f1f3f4;"></div>`;

  const chips = [
    renderChip('Condition', listing.condition),
    renderChip('Sleeve', listing.sleeveCondition),
    renderChip('Format', listing.format),
    listing.year ? renderChip('Year', listing.year) : '',
    renderChip('Ships from', formatShipsFrom(listing.shipsFrom)),
    renderChip('Posted', formatPosted(listing.posted)),
  ]
    .filter(Boolean)
    .join('');

  const comments = listing.comments
    ? `<p style="margin:8px 0 0;color:#5f6368;font-size:13px;line-height:1.5;">${escapeHtml(
        listing.comments,
      )}</p>`
    : '';

  const button = listingHref
    ? `<a href="${listingHref}" style="display:inline-block;margin-top:12px;background:#333333;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:8px 16px;border-radius:4px;">View listing &rarr;</a>`
    : '';

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e8eaed;border-radius:8px;margin:0 0 16px;background:#ffffff;">
      <tr>
        <td style="padding:16px;vertical-align:top;width:96px;">${imageHtml}</td>
        <td style="padding:16px 16px 16px 0;vertical-align:top;">
          <p style="margin:0 0 4px;font-size:16px;font-weight:600;line-height:1.3;">${titleHtml}</p>
          <p style="margin:0 0 10px;font-size:15px;color:#0b8043;font-weight:600;">${escapeHtml(
            formatPrice(listing),
          )}</p>
          <div>${chips}</div>
          ${comments}
          ${button}
        </td>
      </tr>
    </table>`;
};

export const buildDigestHtml = (
  username: string,
  shipsFrom: string,
  listings: TransformedListing[],
): string => {
  const cards = listings.map(renderListingCard).join('');
  const heading = escapeHtml(username);
  const region = escapeHtml(formatShipsFrom(shipsFrom));
  const count = listings.length;
  const plural = count === 1 ? 'listing' : 'listings';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Discogs Wantlist Digest</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#202124;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f5f5;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">
            <tr>
              <td style="padding:0 0 16px;">
                <h1 style="margin:0 0 4px;font-size:20px;">Discogs Wantlist Digest</h1>
                <p style="margin:0;color:#5f6368;font-size:14px;">${count} new ${plural} for <strong>${heading}</strong>${
    region ? ` shipping from <strong>${region}</strong>` : ''
  }.</p>
              </td>
            </tr>
            <tr>
              <td>${cards}</td>
            </tr>
            <tr>
              <td style="padding:8px 0 0;color:#9aa0a6;font-size:12px;text-align:center;">
                Sent by Discogs Market Monitor.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

// Plain-text fallback for clients that do not render HTML.
export const buildDigestText = (
  username: string,
  shipsFrom: string,
  listings: TransformedListing[],
): string => {
  const region = formatShipsFrom(shipsFrom);
  const lines: string[] = [
    `Discogs Wantlist Digest for ${username}${
      region ? ` shipping from ${region}` : ''
    }`,
    '',
  ];

  listings.forEach(listing => {
    lines.push(`${listing.artist} - ${listing.title}`);
    lines.push(formatPrice(listing));
    lines.push(
      `Condition: ${listing.condition} | Sleeve: ${listing.sleeveCondition} | Format: ${listing.format}${
        listing.year ? ` | Year: ${listing.year}` : ''
      }`,
    );

    if (listing.comments) {
      lines.push(listing.comments);
    }

    const link = listingUrl(listing) ?? releaseUrl(listing);

    if (link) {
      lines.push(link);
    }

    lines.push('');
  });

  return lines.join('\n');
};
