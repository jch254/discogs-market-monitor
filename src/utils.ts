import { TransformedListing } from './interfaces';

// Set DEBUG env var to true to enable debug logging
export function debugLog(...params: any[]) {
  if (process.env.DEBUG === 'true') {
    console.log(...params);
  }
}

// Extracts valid numeric marketplace listing ids from RSS marketplace items.
// Shared so both the wantlist scan and the per-release state share one source
// of truth and never emit undefined/non-numeric ids.
export const extractMarketplaceListingIds = (
  marketplaceItems: { link?: string; id?: string }[],
): string[] => {
  return marketplaceItems
    .map((marketplaceItem) => {
      const source = marketplaceItem.link ?? marketplaceItem.id;

      return typeof source === 'string' ? source.split('/').pop() : undefined;
    })
    .filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id));
};

export const transformListing = (
  listing: UserTypes.Listing,
): TransformedListing => {
  return {
    artist: listing.release.artist,
    title: listing.release.title,
    price: listing.original_price.formatted,
    shippingPrice: getShippingPriceWithCurrency(listing),
    uri: listing.uri,
    condition: listing.condition,
    sleeveCondition: listing.sleeve_condition,
    comments: listing.comments,
    posted: listing.posted,
    description: listing.release.description,
    format: listing.release.format,
    year: listing.release.year,
    shipsFrom: listing.ships_from,
  };
};

const getShippingPriceWithCurrency = (listing: UserTypes.Listing) => {
  if (listing.original_shipping_price.value) {
    return `${listing.original_shipping_price.value} ${
      listing.original_shipping_price.currency ||
      listing.original_price.curr_abbr
    }`;
  }

  if (listing.shipping_price.value) {
    return `${listing.shipping_price.value} ${
      listing.shipping_price.currency || listing.original_price.curr_abbr
    }`;
  }

  return 'TBC';
};
