import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

// Cross-entity cleanup for one user's USER#<userId> partition, which holds
// both ReleaseCheckState (RELEASE#) and MarketplaceListingState (LISTING#)
// rows. Unregistering purges the whole partition so a later re-registration
// starts from a clean slate: stale lastSeenListingIds would otherwise suppress
// every listing that already existed - permanently, for listings the previous
// shipsFrom filter excluded - and the recently-checked window would skip the
// immediate first run outright.
const TABLE_NAME = process.env.DYNAMODB_TABLE || '';

// BatchWriteItem hard limit.
const BATCH_SIZE = 25;

const MAX_BATCH_ATTEMPTS = 5;

let docClient: DynamoDBDocumentClient | undefined;

const getDocClient = () => {
  if (!docClient) {
    docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  return docClient;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Deletes every row in the user's partition. Idempotent (a second purge finds
// nothing) and throws on a failed/partial batch so the caller can surface a
// retryable error. Returns the number of rows deleted.
export const purgeUserState = async (userId: string): Promise<number> => {
  if (TABLE_NAME === '') {
    return 0;
  }

  const keys: { PK: string; SK: string }[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const { Items, LastEvaluatedKey } = await getDocClient().send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}` },
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    keys.push(...((Items as { PK: string; SK: string }[] | undefined) ?? []));
    exclusiveStartKey = LastEvaluatedKey;
  } while (exclusiveStartKey);

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    let requests = keys
      .slice(i, i + BATCH_SIZE)
      .map(Key => ({ DeleteRequest: { Key } }));

    // Throttled deletes come back as UnprocessedItems rather than an error;
    // retry just those with a growing pause.
    for (let attempt = 1; requests.length > 0; attempt += 1) {
      if (attempt > MAX_BATCH_ATTEMPTS) {
        throw new Error(
          `purgeUserState: ${requests.length} deletes still unprocessed after ${MAX_BATCH_ATTEMPTS} attempts`,
        );
      }

      if (attempt > 1) {
        await sleep(200 * attempt);
      }

      const { UnprocessedItems } = await getDocClient().send(
        new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: requests } }),
      );

      requests = (UnprocessedItems?.[TABLE_NAME] ?? []) as typeof requests;
    }
  }

  return keys.length;
};
