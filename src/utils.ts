import { TransformedListing } from "./interfaces";

// Set DEBUG env var to true to enable debug logging
export function debugLog(...params: any[]) {
  if (process.env.DEBUG === 'true') {
    console.log(...params);
  }
}

export const transformListing = (listing: UserTypes.Listing): TransformedListing => {
  return {
    artist: listing.release.artist,
    title: listing.release.title,
    price: listing.original_price.formatted,
    shippingPrice: listing.original_shipping_price ? `${listing.original_shipping_price.value} ${listing.original_shipping_price.currency}` : undefined,
    uri: listing.uri,
    condition: listing.condition,
    sleeveCondition: listing.sleeve_condition,
    comments: listing.comments,
    posted: listing.posted,
    description: listing.release.description,
    format: listing.release.format,
    year: listing.release.year,
    shipsFrom: listing.ships_from,
  }
}


