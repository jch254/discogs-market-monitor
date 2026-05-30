import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

// Single-table design (mirrors the shared dynamodb-single-table module).
// ReleaseCheckState rows are keyed:
//   PK = USER#<userId>   SK = RELEASE#<releaseId>
// Future entities (e.g. MarketplaceListingState) live in the same physical
// table under different key prefixes.
const TABLE_NAME = process.env.DYNAMODB_TABLE || '';

// Releases checked within this window are skipped to avoid recomputing the full
// wantlist on frequent re-runs. Configurable via env; defaults to 1 hour.
const RECENTLY_CHECKED_MS =
  Number(process.env.RECENTLY_CHECKED_MS) || 60 * 60 * 1000;

// TTL so rows for releases no longer in a wantlist self-expire.
const STATE_TTL_MS =
  Number(process.env.STATE_TTL_MS) || 30 * 24 * 60 * 60 * 1000;

export interface ReleaseCheckState {
  userId: string;
  releaseId: string;
  lastCheckedAt: string;
  lastSeenListingIds?: string[];
  lastUpdatedAt: string;
}

const pk = (userId: string) => `USER#${userId}`;
const sk = (releaseId: string | number) => `RELEASE#${releaseId}`;

let docClient: DynamoDBDocumentClient | undefined;

const getDocClient = () => {
  if (!docClient) {
    docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  return docClient;
};

// State is optional: when the table isn't configured (e.g. local dev) the
// repository is a no-op so behaviour falls back to a full scan.
export const isStateEnabled = () => TABLE_NAME !== '';

export const getReleaseCheckState = async (
  userId: string,
  releaseId: string | number,
): Promise<ReleaseCheckState | undefined> => {
  if (!isStateEnabled()) {
    return undefined;
  }

  const { Item } = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk(userId), SK: sk(releaseId) },
    }),
  );

  return Item as ReleaseCheckState | undefined;
};

export const putReleaseCheckState = async (state: {
  userId: string;
  releaseId: string | number;
  lastSeenListingIds?: string[];
}): Promise<void> => {
  if (!isStateEnabled()) {
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: pk(state.userId),
        SK: sk(state.releaseId),
        userId: state.userId,
        releaseId: String(state.releaseId),
        lastSeenListingIds: state.lastSeenListingIds,
        lastCheckedAt: nowIso,
        lastUpdatedAt: nowIso,
        ttl: Math.floor((now.getTime() + STATE_TTL_MS) / 1000),
      },
    }),
  );
};

export const wasCheckedRecently = (
  state: ReleaseCheckState | undefined,
  now = Date.now(),
): boolean => {
  if (!state?.lastCheckedAt) {
    return false;
  }

  return now - new Date(state.lastCheckedAt).getTime() < RECENTLY_CHECKED_MS;
};
