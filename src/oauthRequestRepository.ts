import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

// Short-lived store bridging the two HTTP hops of the OAuth 1.0a flow. Between
// /oauth/start (request token issued) and /oauth/callback (user redirected
// back) we must remember the request token secret plus the signup context the
// user supplied, keyed by the request token Discogs echoes back. Rows live in
// the same single table:
//   PK = OAUTH_REQUEST   SK = OAUTH_REQUEST#<requestToken>
// A `ttl` self-expires abandoned authorisations.
const TABLE_NAME = process.env.DYNAMODB_TABLE || '';

const OAUTH_REQUEST_PK = 'OAUTH_REQUEST';

const sk = (requestToken: string) => `OAUTH_REQUEST#${requestToken}`;

// Pending authorisations expire if the user doesn't finish promptly.
const REQUEST_TTL_MS =
  Number(process.env.OAUTH_REQUEST_TTL_MS) || 15 * 60 * 1000;

export interface PendingOAuthRequest {
  requestToken: string;
  requestTokenSecret: string;
  // Signup context captured at /oauth/start, applied to the monitor once the
  // user finishes authorising.
  shipsFrom: string;
  destinationEmail: string;
  frequencyHours?: number;
  createdAt: string;
}

let docClient: DynamoDBDocumentClient | undefined;

const getDocClient = () => {
  if (!docClient) {
    docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  return docClient;
};

export const isOAuthRequestStoreEnabled = () => TABLE_NAME !== '';

export const putPendingOAuthRequest = async (input: {
  requestToken: string;
  requestTokenSecret: string;
  shipsFrom: string;
  destinationEmail: string;
  frequencyHours?: number;
}): Promise<void> => {
  if (!isOAuthRequestStoreEnabled()) {
    throw new Error('DYNAMODB_TABLE is not configured; OAuth flow unavailable');
  }

  const now = Date.now();

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: OAUTH_REQUEST_PK,
        SK: sk(input.requestToken),
        requestToken: input.requestToken,
        requestTokenSecret: input.requestTokenSecret,
        shipsFrom: input.shipsFrom,
        destinationEmail: input.destinationEmail,
        frequencyHours: input.frequencyHours,
        createdAt: new Date(now).toISOString(),
        ttl: Math.floor((now + REQUEST_TTL_MS) / 1000),
      },
    }),
  );
};

export const getPendingOAuthRequest = async (
  requestToken: string,
): Promise<PendingOAuthRequest | undefined> => {
  if (!isOAuthRequestStoreEnabled()) {
    return undefined;
  }

  const { Item } = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: OAUTH_REQUEST_PK, SK: sk(requestToken) },
    }),
  );

  if (!Item) {
    return undefined;
  }

  // TTL deletion is best-effort/eventually-consistent, so guard against a row
  // that has logically expired but not yet been swept.
  if (typeof Item.ttl === 'number' && Item.ttl * 1000 < Date.now()) {
    return undefined;
  }

  return Item as PendingOAuthRequest;
};

export const deletePendingOAuthRequest = async (
  requestToken: string,
): Promise<void> => {
  if (!isOAuthRequestStoreEnabled()) {
    return;
  }

  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: OAUTH_REQUEST_PK, SK: sk(requestToken) },
    }),
  );
};
