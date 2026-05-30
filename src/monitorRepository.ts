import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

// Monitor: a user-registered subscription describing one wantlist marketplace
// monitor. Lives in the same single table as the workflow state entities:
//   PK = MONITOR   SK = MONITOR#<username>
// A fixed partition key lets the scheduled dispatcher list every monitor with a
// single Query and fan one Step Functions execution out per user.
const TABLE_NAME = process.env.DYNAMODB_TABLE || '';

const MONITOR_PK = 'MONITOR';

const sk = (username: string) => `MONITOR#${username.toLowerCase()}`;

// Default dispatch cadence (hours) when a monitor doesn't specify one.
export const DEFAULT_FREQUENCY_HOURS = 12;

export interface Monitor {
  username: string;
  shipsFrom: string; // Multiple supported - comma separated
  destinationEmail: string;
  // Optional per-user Discogs personal access token. Required to read a
  // private wantlist; public wantlists work without it (falls back to the
  // shared service token).
  discogsToken?: string;
  // Optional per-user Discogs OAuth 1.0a access token + secret, obtained when
  // the user completes the OAuth flow. Preferred over discogsToken; signs API
  // calls with the app consumer key/secret on the user's behalf.
  discogsOAuthToken?: string;
  discogsOAuthTokenSecret?: string;
  // How often (in hours) the scheduled dispatcher should start a run for this
  // user. Honoured against `lastDispatchedAt`; the effective minimum is the
  // deployment-level dispatcher schedule rate.
  frequencyHours: number;
  // ISO timestamp of the last run the dispatcher started for this monitor.
  lastDispatchedAt?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
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

export const isMonitorStoreEnabled = () => TABLE_NAME !== '';

// Upsert a monitor. Preserves createdAt on update so re-registering the same
// username refreshes config without losing the original signup timestamp.
export const putMonitor = async (input: {
  username: string;
  shipsFrom: string;
  destinationEmail: string;
  discogsToken?: string;
  discogsOAuthToken?: string;
  discogsOAuthTokenSecret?: string;
  frequencyHours?: number;
  enabled?: boolean;
}): Promise<Monitor> => {
  const existing = await getMonitor(input.username);
  const nowIso = new Date().toISOString();

  const monitor: Monitor = {
    username: input.username,
    shipsFrom: input.shipsFrom,
    destinationEmail: input.destinationEmail,
    discogsToken: input.discogsToken,
    discogsOAuthToken: input.discogsOAuthToken ?? existing?.discogsOAuthToken,
    discogsOAuthTokenSecret:
      input.discogsOAuthTokenSecret ?? existing?.discogsOAuthTokenSecret,
    frequencyHours:
      input.frequencyHours ?? existing?.frequencyHours ?? DEFAULT_FREQUENCY_HOURS,
    lastDispatchedAt: existing?.lastDispatchedAt,
    enabled: input.enabled ?? existing?.enabled ?? true,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: MONITOR_PK,
        SK: sk(input.username),
        ...monitor,
      },
    }),
  );

  return monitor;
};

export const getMonitor = async (
  username: string,
): Promise<Monitor | undefined> => {
  if (!isMonitorStoreEnabled()) {
    return undefined;
  }

  const { Item } = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: MONITOR_PK, SK: sk(username) },
    }),
  );

  return Item as Monitor | undefined;
};

// Lists every registered monitor. Used by the scheduled dispatcher to fan out
// one workflow execution per user.
export const listMonitors = async (): Promise<Monitor[]> => {
  if (!isMonitorStoreEnabled()) {
    return [];
  }

  const monitors: Monitor[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const { Items, LastEvaluatedKey } = await getDocClient().send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': MONITOR_PK },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    monitors.push(...((Items as Monitor[] | undefined) ?? []));
    lastEvaluatedKey = LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return monitors;
};

export const deleteMonitor = async (username: string): Promise<void> => {
  if (!isMonitorStoreEnabled()) {
    return;
  }

  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: MONITOR_PK, SK: sk(username) },
    }),
  );
};

// Records that the dispatcher just started a run for this monitor, so the next
// schedule tick can decide whether the user is due again based on frequency.
export const markDispatched = async (
  username: string,
  when: string = new Date().toISOString(),
): Promise<void> => {
  if (!isMonitorStoreEnabled()) {
    return;
  }

  await getDocClient().send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: MONITOR_PK, SK: sk(username) },
      UpdateExpression: 'SET lastDispatchedAt = :ts',
      ExpressionAttributeValues: { ':ts': when },
    }),
  );
};
