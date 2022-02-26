import Parser from "rss-parser";

export interface DiscogsUserWantlistMarketplaceItem {
  title: string;
  marketplaceItems: ({
      [key: string]: any;
  } & Parser.Item)[];
}