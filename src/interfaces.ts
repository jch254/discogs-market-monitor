import { ScheduledEvent } from 'aws-lambda';
import Parser from 'rss-parser';

export interface DiscogsUserWantlistMarketplaceItem {
  title: string;
  marketplaceItems: ({
    [key: string]: any;
  } & Parser.Item)[];
}

export interface TransformedListing {
  uri: string;
  condition: string;
  sleeveCondition: string;
  comments: string;
  shipsFrom: string;
  posted: string;
  price: string;
  shippingPrice?: string;
  description: string;
  artist: string;
  format: string;
  title: string;
  year: number;
}

export interface MarketMonitorEvent extends ScheduledEvent {
  destinationEmail: string;
  username: string;
  shipsFrom: string; // Multiple supported - comma separated
}

// One unit of work in the Step Functions Distributed Map: a single
// (userId, releaseId) pair. NOT a whole wantlist.
export interface WantlistReleaseTask {
  userId: string;
  releaseId: number;
  title: string;
  shipsFrom: string;
  destinationEmail: string;
}

// Output of the GetWantlist Lambda — the Map iterates over `items`.
export interface GetWantlistResult {
  username: string;
  shipsFrom: string;
  destinationEmail: string;
  items: WantlistReleaseTask[];
}

// Output of the CheckReleaseMarketplace worker for one release.
export interface CheckReleaseResult {
  releaseId: number;
  title: string;
  newListings: TransformedListing[];
}

// Input to the SendDigest Lambda (GetWantlist output + Map results).
export interface SendDigestEvent {
  username: string;
  shipsFrom: string;
  destinationEmail: string;
  results: CheckReleaseResult[];
}
