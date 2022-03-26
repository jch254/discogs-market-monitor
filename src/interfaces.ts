import { ScheduledEvent } from "aws-lambda";
import Parser from "rss-parser";

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
  shippingPrice: string;
  description: string;
  artist: string;
  format: string;
  title: string;
  year: number;
}

export type MonitorEvent = ScheduledEvent & {
  data: {
    runRepeat: boolean;
    currentIndex: number;
    currentListings: TransformedListing[];
  };
};
