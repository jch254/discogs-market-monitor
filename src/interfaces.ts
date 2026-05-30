import { ScheduledEvent } from 'aws-lambda';

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
  // Cover art thumbnail URL and Discogs release id, used to render a rich
  // digest email (image + release link). Optional for backwards compatibility
  // with rows persisted before these fields existed.
  thumbnail?: string;
  releaseId?: number;
}

export interface MarketMonitorEvent extends ScheduledEvent {
  destinationEmail: string;
  username: string;
  shipsFrom: string; // Multiple supported - comma separated
  // Optional per-user Discogs personal access token, supplied at signup. Used
  // to read a private wantlist; falls back to the shared service token.
  discogsToken?: string;
  // Optional per-user Discogs OAuth 1.0a access token + secret, obtained via
  // the OAuth flow. Preferred over discogsToken when present.
  discogsOAuthToken?: string;
  discogsOAuthTokenSecret?: string;
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

// Output of the CheckReleaseMarketplace worker for one release. New matching
// listings are written to MarketplaceListingState, so this is just a summary.
export interface CheckReleaseResult {
  releaseId: number;
  title: string;
  newListingCount: number;
}

// Input to the SendDigest Lambda. Notifications are driven by un-notified
// MarketplaceListingState rows, not by the Map results, so only the user
// identity/config is required here.
export interface SendDigestEvent {
  username: string;
  shipsFrom: string;
  destinationEmail: string;
}
