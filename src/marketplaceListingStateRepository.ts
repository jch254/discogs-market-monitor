import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { TransformedListing } from './interfaces';

// MarketplaceListingState: per-listing dedupe + notification ledger. Lives in
// the same single table as ReleaseCheckState:
//   PK = USER#<userId>   SK = LISTING#<listingId>
// This is the source of truth for notifications, decoupling email from the
// recomputation/orchestration logic.
const TABLE_NAME = process.env.DYNAMODB_TABLE || '';

const STATE_TTL_MS =
  Number(process.env.LISTING_TTL_MS) || 30 * 24 * 60 * 60 * 1000;

export interface MarketplaceListingState {
  userId: string;
  listingId: string;
  releaseId: string;
  listing: TransformedListing;
  notified: boolean;
  firstSeenAt: string;
  notifiedAt?: string;
}

const pk = (userId: string) => `USER#${userId}`;
const sk = (listingId: string) => `LISTING#${listingId}`;

let docClient: DynamoDBDocumentClient | undefined;

const getDocClient = () => {
  if (!docClient) {
    docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  return docClient;
};

export const isListingStateEnabled = () => TABLE_NAME !== '';

// Records a newly-seen matching listing as un-notified. Idempotent: a
// conditional put means an already-known (possibly already-notified) listing is
// never reset, so retries can't re-notify. Returns true if newly recorded.
export const recordNewListing = async (input: {
  userId: string;
  listingId: string;
  releaseId: string | number;
  listing: TransformedListing;
}): Promise<boolean> => {
  if (!isListingStateEnabled()) {
    return false;
  }

  const now = new Date();

  try {
    await getDocClient().send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: pk(input.userId),
          SK: sk(input.listingId),
          userId: input.userId,
          listingId: input.listingId,
          releaseId: String(input.releaseId),
          listing: input.listing,
          notified: false,
          firstSeenAt: now.toISOString(),
          ttl: Math.floor((now.getTime() + STATE_TTL_MS) / 1000),
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );

    return true;
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return false;
    }

    throw error;
  }
};

export const getUnnotifiedListings = async (
  userId: string,
): Promise<MarketplaceListingState[]> => {
  if (!isListingStateEnabled()) {
    return [];
  }

  const listings: MarketplaceListingState[] = [];
  let exclusiveStartKey: Record<string, any> | undefined;

  do {
    const result = await getDocClient().send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: '#notified = :false',
        ExpressionAttributeNames: { '#notified': 'notified' },
        ExpressionAttributeValues: {
          ':pk': pk(userId),
          ':sk': 'LISTING#',
          ':false': false,
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    listings.push(...((result.Items as MarketplaceListingState[]) ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return listings;
};

export const markListingsNotified = async (
  userId: string,
  listingIds: string[],
): Promise<void> => {
  if (!isListingStateEnabled()) {
    return;
  }

  const notifiedAt = new Date().toISOString();

  for (const listingId of listingIds) {
    await getDocClient().send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk(userId), SK: sk(listingId) },
        UpdateExpression: 'SET #notified = :true, notifiedAt = :notifiedAt',
        ExpressionAttributeNames: { '#notified': 'notified' },
        ExpressionAttributeValues: { ':true': true, ':notifiedAt': notifiedAt },
      }),
    );
  }
};
