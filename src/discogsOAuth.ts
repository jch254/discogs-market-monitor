import { Client as DiscogsClient } from 'disconnect';
import { USER_AGENT } from './wrappedDiscogsClient';

// Thin promise wrapper around the disconnect library's callback-based OAuth
// 1.0a helpers. Implements the three legs of the Discogs OAuth flow:
//   1. createRequestToken    -> temporary request token + authorize URL
//   2. (user authorises on discogs.com and is redirected back)
//   3. exchangeAccessToken   -> long-lived per-user access token + secret
// See https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow

const getConsumerCreds = () => {
  const consumerKey = process.env.DISCOGS_CONSUMER_KEY;
  const consumerSecret = process.env.DISCOGS_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error(
      'DISCOGS_CONSUMER_KEY and DISCOGS_CONSUMER_SECRET must be set to use the OAuth flow',
    );
  }

  return { consumerKey, consumerSecret };
};

export interface RequestToken {
  // Temporary request token (echoed back by Discogs as oauth_token on the
  // callback) and its secret, needed to later mint the access token.
  token: string;
  tokenSecret: string;
  // Where to send the user to grant access.
  authorizeUrl: string;
}

// Leg 1: ask Discogs for a request token and the URL to send the user to.
export const createRequestToken = (
  callbackUrl: string,
): Promise<RequestToken> => {
  const { consumerKey, consumerSecret } = getConsumerCreds();

  return new Promise((resolve, reject) => {
    new DiscogsClient(USER_AGENT)
      .oauth()
      .getRequestToken(consumerKey, consumerSecret, callbackUrl, (err, auth) => {
        if (err || !auth?.token) {
          reject(err ?? new Error('Discogs returned no request token'));

          return;
        }

        resolve({
          token: auth.token,
          tokenSecret: auth.tokenSecret,
          authorizeUrl: auth.authorizeUrl,
        });
      });
  });
};

export interface AccessToken {
  token: string;
  tokenSecret: string;
}

// Leg 3: exchange the authorised request token + verifier for a long-lived
// access token/secret that signs future API calls on the user's behalf.
export const exchangeAccessToken = (
  requestToken: string,
  requestTokenSecret: string,
  verifier: string,
): Promise<AccessToken> => {
  const { consumerKey, consumerSecret } = getConsumerCreds();

  return new Promise((resolve, reject) => {
    new DiscogsClient(USER_AGENT, {
      method: 'oauth',
      consumerKey,
      consumerSecret,
      token: requestToken,
      tokenSecret: requestTokenSecret,
      level: 1,
    })
      .oauth()
      .getAccessToken(verifier, (err, auth) => {
        if (err || !auth?.token) {
          reject(err ?? new Error('Discogs returned no access token'));

          return;
        }

        resolve({ token: auth.token, tokenSecret: auth.tokenSecret });
      });
  });
};

// Confirms the access token works and resolves the authenticated user's Discogs
// username, which keys the monitor record.
export const getOAuthIdentityUsername = async (
  token: string,
  tokenSecret: string,
): Promise<string> => {
  const { consumerKey, consumerSecret } = getConsumerCreds();

  const identity = await new DiscogsClient(USER_AGENT, {
    method: 'oauth',
    consumerKey,
    consumerSecret,
    token,
    tokenSecret,
    level: 2,
  }).getIdentity();

  if (!identity?.username) {
    throw new Error('Discogs identity did not include a username');
  }

  return identity.username;
};
