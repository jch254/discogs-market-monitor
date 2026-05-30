import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  createRequestToken,
  exchangeAccessToken,
  getOAuthIdentityUsername,
} from './discogsOAuth';
import { putMonitor } from './monitorRepository';
import {
  deletePendingOAuthRequest,
  getPendingOAuthRequest,
  putPendingOAuthRequest,
} from './oauthRequestRepository';

// Server-side Discogs OAuth 1.0a flow, hosted entirely in this repo.
//
//   GET /oauth/start?destinationEmail=&shipsFrom=&frequencyHours=
//     Captures the signup context, requests a Discogs request token and
//     302-redirects the user to Discogs to authorise.
//
//   GET /oauth/callback?oauth_token=&oauth_verifier=
//     Discogs redirects back here. Exchanges the request token for a long-lived
//     access token, reads the authenticated username, and persists a monitor so
//     the scheduled dispatcher can act on the user's behalf.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MIN_FREQUENCY_HOURS = 1;
const MAX_FREQUENCY_HOURS = 168; // one week

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

// Marketplace/identity values are interpolated into HTML responses, so escape
// them to avoid reflecting untrusted content into the page.
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const html = (
  statusCode: number,
  body: string,
): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: `<!doctype html><html><head><meta charset="utf-8"><title>Discogs Market Monitor</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">${body}</body></html>`,
});

const redirect = (location: string): APIGatewayProxyResultV2 => ({
  statusCode: 302,
  headers: { location },
  body: '',
});

// Build the absolute callback URL from the incoming request so we never have to
// hard-code the deployed API domain.
const callbackUrlFor = (event: APIGatewayProxyEventV2): string => {
  const domain = event.requestContext?.domainName;

  if (!domain) {
    throw new Error('Unable to determine request domain for OAuth callback');
  }

  return `https://${domain}/oauth/callback`;
};

const handleStart = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const query = event.queryStringParameters ?? {};
  const destinationEmail = query.destinationEmail?.trim();
  const shipsFrom = query.shipsFrom?.trim();

  if (!isNonEmptyString(destinationEmail) || !EMAIL_RE.test(destinationEmail)) {
    return html(
      400,
      '<h1>Invalid request</h1><p>A valid <code>destinationEmail</code> query parameter is required.</p>',
    );
  }

  if (!isNonEmptyString(shipsFrom)) {
    return html(
      400,
      '<h1>Invalid request</h1><p>A <code>shipsFrom</code> query parameter (comma separated countries) is required.</p>',
    );
  }

  let frequencyHours: number | undefined;

  if (isNonEmptyString(query.frequencyHours)) {
    const parsed = Number(query.frequencyHours);

    if (
      !Number.isInteger(parsed) ||
      parsed < MIN_FREQUENCY_HOURS ||
      parsed > MAX_FREQUENCY_HOURS
    ) {
      return html(
        400,
        `<h1>Invalid request</h1><p><code>frequencyHours</code>, when provided, must be a whole number between ${MIN_FREQUENCY_HOURS} and ${MAX_FREQUENCY_HOURS}.</p>`,
      );
    }

    frequencyHours = parsed;
  }

  const requestToken = await createRequestToken(callbackUrlFor(event));

  await putPendingOAuthRequest({
    requestToken: requestToken.token,
    requestTokenSecret: requestToken.tokenSecret,
    shipsFrom,
    destinationEmail,
    frequencyHours,
  });

  return redirect(requestToken.authorizeUrl);
};

const handleCallback = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const query = event.queryStringParameters ?? {};
  const oauthToken = query.oauth_token?.trim();
  const verifier = query.oauth_verifier?.trim();

  if (query.denied) {
    return html(
      400,
      '<h1>Authorisation cancelled</h1><p>You declined access on Discogs, so no monitor was created.</p>',
    );
  }

  if (!isNonEmptyString(oauthToken) || !isNonEmptyString(verifier)) {
    return html(
      400,
      '<h1>Invalid callback</h1><p>Missing <code>oauth_token</code> or <code>oauth_verifier</code>.</p>',
    );
  }

  const pending = await getPendingOAuthRequest(oauthToken);

  if (!pending) {
    return html(
      400,
      '<h1>Authorisation expired</h1><p>This authorisation link is unknown or has expired. Please start again.</p>',
    );
  }

  const accessToken = await exchangeAccessToken(
    oauthToken,
    pending.requestTokenSecret,
    verifier,
  );

  const username = await getOAuthIdentityUsername(
    accessToken.token,
    accessToken.tokenSecret,
  );

  await putMonitor({
    username,
    shipsFrom: pending.shipsFrom,
    destinationEmail: pending.destinationEmail,
    frequencyHours: pending.frequencyHours,
    discogsOAuthToken: accessToken.token,
    discogsOAuthTokenSecret: accessToken.tokenSecret,
  });

  // One-time use: drop the pending request so the verifier can't be replayed.
  await deletePendingOAuthRequest(oauthToken);

  return html(
    200,
    `<h1>Connected to Discogs</h1><p>Hi <strong>${escapeHtml(
      username,
    )}</strong> — your wantlist marketplace monitor is now active. Digests will be sent to <strong>${escapeHtml(
      pending.destinationEmail,
    )}</strong>.</p>`,
  );
};

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const path = event.requestContext?.http?.path ?? event.rawPath ?? '';

  try {
    if (path.endsWith('/oauth/callback')) {
      return await handleCallback(event);
    }

    if (path.endsWith('/oauth/start')) {
      return await handleStart(event);
    }

    return html(404, '<h1>Not found</h1>');
  } catch (error: any) {
    console.log('OAUTH FLOW ERROR', { path, message: error?.message });

    return html(
      500,
      '<h1>Something went wrong</h1><p>The Discogs authorisation could not be completed. Please try again.</p>',
    );
  }
}
