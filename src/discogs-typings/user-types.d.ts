declare namespace UserTypes {
  type GetInventorySortingKeys = "listed" | "price" | "item" | "artist" | "label" | "catno" | "audio" | "status" | "location"
  type GetContributionsSortingKeys = "label" | "artist" | "title" | "catno" | "format" | "rating" | "year" | "added"

  interface GetInventoryParams {
    status?: string
  }

  interface GetInventoryResponse {
    pagination: DiscogsTypes.Pagination;
    listings: Listing[];
  }

  interface Listing {
    status: string;
    original_price: OriginalPrice;
    ships_from: string;
    original_shipping_price: ShippingPrice;
    price: Price;
    allow_offers: boolean;
    uri: string;
    comments: string;
    seller: Seller;
    sleeve_condition: string;
    shipping_price: ShippingPrice;
    release: Release;
    resource_url: string;
    audio: boolean;
    id: number;
    condition: string;
    posted: string;

    // If the authorized user is the listing owner the listing will include 
    // the weight, format_quantity, external_id, and location keys. 
    // If the user is authorized, the listing will contain a in_cart boolean 
    // field indicating whether or not this listing is in their cart.
    in_cart?: boolean;
    weight?: number;
    external_id?: string;
    location?: string;
    format_quantity?: number;
  }

  interface OriginalPrice {
    converted?: OriginalPrice; // appears in marketplace
    curr_abbr: string;
    formatted: string;
    value: number;
    curr_id: number;
  }

  interface ShippingPrice {
    currency: string;
    value: number;
  }

  interface Price {
    currency: string;
    value: number;
  }

  interface Release {
    description: string;
    format: string;
    year: number;
    images: Image[];
    id: number;
    stats: ReleaseStats;
    catalog_number: string;
    artist: string;
    title: string;
    resource_url: string;
    thumbnail: string;
  }

  interface ReleaseStats {
    community: Community;
    user?: Community; // appears in marketplace
  }

  interface Community {
    in_collection: number;
    in_wantlist: number;
  }

  interface Seller {
    username: string;
    stats: SellerStats;
    uid: number;
    url: string;
    html_url: string;
    shipping: string;
    payment: string;
    avatar_url: string;
    resource_url: string;
    id: number;
  }

  interface SellerStats {
    rating: string;
    total: number;
    stars: number;
  }

  interface Profile {
    profile: string;
    banner_url: string;
    wantlist_url: string;
    seller_num_ratings: number;
    rank: number;
    is_staff: boolean;
    num_pending: number;
    id: number;
    marketplace_suspended: boolean;
    buyer_rating: number;
    num_for_sale: number;
    home_page: string;
    location: string;
    collection_folders_url: string;
    username: string;
    collection_fields_url: string;
    releases_contributed: number;
    activated: boolean;
    registered: string;
    rating_avg: number;
    releases_rated: number;
    curr_abbr: string;
    seller_rating_stars: number;
    num_lists: number;
    name: string;
    buyer_rating_stars: number;
    num_wantlist?: number;
    inventory_url: string;
    uri: string;
    buyer_num_ratings: number;
    avatar_url: string;
    resource_url: string;
    seller_rating: number;
    num_collection?: number;
  }

  interface GetContributionsResponse {
    pagination: DiscogsTypes.Pagination,
    contributions: Contribution[];
  }

  interface Contribution {
    series: Company[];
    labels: Company[];
    community: Community;
    year: number;
    images?: Image[];
    format_quantity: number;
    id: number;
    artists_sort: string;
    genres: string[];
    thumb: string;
    num_for_sale: number;
    title: string;
    artists: Artist[];
    date_changed: Date;
    master_id?: number;
    lowest_price: number | null;
    status: string;
    estimated_weight?: number;
    master_url?: string;
    date_added: Date;
    notes?: string;
    identifiers: Identifier[];
    companies: Company[];
    uri: string;
    formats: Format[];
    resource_url: string;
    data_quality: string;
    styles?: string[];
    released_formatted?: string;
    released?: string;
    country?: string;
    videos?: Video[];
  }

  interface Artist {
    join: string;
    name: string;
    anv: string;
    tracks: string;
    role: string;
    resource_url: string;
    id: number;
  }

  interface Community {
    status: string;
    rating: Rating;
    want: number;
    contributors: Submitter[];
    have: number;
    submitter: Submitter;
    data_quality: string;
  }
  interface Submitter {
    username: string;
    resource_url: string;
  }
  interface Rating {
    count: number;
    average: number;
  }
  interface Company {
    name: string;
    entity_type: string;
    catno: string;
    resource_url: string;
    id: number;
    entity_type_name: string;
  }

  interface Format {
    qty: string;
    descriptions?: string[];
    name: string;
    text?: string;
  }

  interface Identifier {
    type: string;
    description?: string;
    value: string;
  }

  interface Image {
    uri: string;
    height: number;
    width: number;
    resource_url: string;
    type: string;
    uri150: string;
  }

  interface Video {
    duration: number;
    embed: boolean;
    title: string;
    description: string;
    uri: string;
  }


  interface GetSubmissionsResponse {
    pagination: DiscogsTypes.Pagination,
    submissions: Submissions
  }

  interface Submissions {
    labels: SubmissionsLabel[];
    releases: SubmissionsRelease[];
    artists: SubmissionsArtist[];
  }

  interface SubmissionsArtist {
    profile: string;
    releases_url: string;
    name: string;
    uri: string;
    urls?: string[];
    resource_url: string;
    id: number;
    data_quality: string;
    realname?: string;
    aliases?: string[];
    members?: string[];
    groups?: string[];
    namevariations?: string[];
    images?: Image[];
  }

  interface SubmissionsLabel {
    profile?: string;
    parentLabel?: string;
    releases_url: string;
    name: string;
    uri: string;
    resource_url: string;
    id: number;
    data_quality: string;
    urls?: string[];
    images?: Image[];
    contactinfo?: string;
  }

  interface SubmissionsRelease {
    status: string;
    videos?: Video[];
    series: Company[];
    labels: Company[];
    year: number;
    community: Community;
    artists: Artist[];
    images?: Image[];
    format_quantity: number;
    id: number;
    artists_sort: string;
    genres: string[];
    thumb: string;
    num_for_sale: number;
    title: string;
    date_changed: string;
    lowest_price: number | null;
    styles?: string[];
    released_formatted?: string;
    estimated_weight?: number;
    released?: string;
    date_added: string;
    country?: string;
    notes?: string;
    identifiers: Identifier[];
    companies: Company[];
    uri: string;
    formats: Format[];
    resource_url: string;
    data_quality: string;
    master_id?: number;
    master_url?: string;
  }

  interface GetListsResponse {
    pagination: DiscogsTypes.Pagination,
    lists: List[]
  }

  interface List {
    resource_url: string;
    public: boolean;
    image_url: string;
    user: User;
    date_changed: string;
    date_added: string;
    description: string;
    uri: string;
    id: number;
    name: string;
  }

  interface User {
    username: string;
    resource_url: string;
    avatar_url: string;
    id: number;
  }

}