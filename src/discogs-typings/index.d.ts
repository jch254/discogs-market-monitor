declare module "disconnect" {
  type Auth =
    | { userToken: string }
    | { consumerKey: string, consumerSecret: string }
    | { method: "oauth", consumerKey: string, consumerSecret: string, token: string, tokenSecret: string, level: AuthLevel }

  type Config = {
    host: string;
    port: number;
    userAgent: string;
    apiVersion: string;
    outputFormat: "discogs" | "html" | "plaintext";
    requestLimit: number;
    requestLimitAuth: number;
    requestLimitInterval: number;
  };

  interface DiscogsError {
    statusCode: number;
    message: string;
    rateLimit: { limit: number, used: number, remaining: number } | null
  }

  interface AuthError extends DiscogsError { }

  interface Callback<T> {
    (err: DiscogsError | null, data: T | null, rateLimit: { limit: number, used: number, remaining: number } | null): void;
  }

  type AuthLevel = 0 | 1 | 2;
  type AuthMethod = "discogs" | "none" | "oauth";

  interface About extends DiscogsTypes.ApiIndex {
    disconnect: {
      version: string;
      userAgent: string;
      authMethod: AuthMethod;
      authLevel: AuthLevel;
    }
  }

  type GetOptions = {
    queue: boolean;
    json: boolean;
  };

  type PaginationOpts = {
    page?: number;
    per_page?: number;
  };

  type SortingOpts<Keys extends string> = {
    sort?: Keys;
    sort_order?: "asc" | "desc"
  }

  type EmptyResponse = any

  interface Database {
    status: { accepted: 'Accepted', draft: 'Draft', deleted: 'Deleted', rejected: 'Rejected' }

    getArtist(artist: number, callback: Callback<DiscogsDatabaseTypes.Artist>): Client;
    getArtist(artist: number): Promise<DiscogsDatabaseTypes.Artist>;

    getArtistReleases(artist: number, params: PaginationOpts, callback: Callback<DiscogsDatabaseTypes.ArtistReleasesResponse>): Client;
    getArtistReleases(artist: number, callback: Callback<DiscogsDatabaseTypes.ArtistReleasesResponse>): Client;
    getArtistReleases(artist: number, params: PaginationOpts): Promise<DiscogsDatabaseTypes.ArtistReleasesResponse>;
    getArtistReleases(artist: number): Promise<DiscogsDatabaseTypes.ArtistReleasesResponse>;

    getRelease(release: number, callback: Callback<DiscogsDatabaseTypes.Release>): Client;
    getRelease(release: number): Promise<DiscogsDatabaseTypes.Release>;

    getReleaseRating(release: number, user: string, callback: Callback<DiscogsDatabaseTypes.ReleaseRatingByUser>): Client;
    getReleaseRating(release: number, user: string): Promise<DiscogsDatabaseTypes.ReleaseRatingByUser>;

    setReleaseRating(release: number, user: string, rating: number, callback: Callback<DiscogsDatabaseTypes.ReleaseRatingByUser>): Client;
    setReleaseRating(release: number, user: string, rating: number): Promise<DiscogsDatabaseTypes.ReleaseRatingByUser>;

    getMaster(master: number, callback: Callback<DiscogsDatabaseTypes.Master>): Client;
    getMaster(master: number): Promise<DiscogsDatabaseTypes.Master>;

    getMasterVersions(master: number, params: PaginationOpts, callback: Callback<DiscogsDatabaseTypes.MasterVersionsResponse>): Client;
    getMasterVersions(master: number, callback: Callback<DiscogsDatabaseTypes.MasterVersionsResponse>): Client;
    getMasterVersions(master: number, params: PaginationOpts): Promise<DiscogsDatabaseTypes.MasterVersionsResponse>;
    getMasterVersions(master: number): Promise<DiscogsDatabaseTypes.MasterVersionsResponse>;

    getLabel(label: number, callback: Callback<DiscogsDatabaseTypes.Label>): Client;
    getLabel(label: number): Promise<DiscogsDatabaseTypes.Label>;

    getLabelReleases(label: number, params: PaginationOpts, callback: Callback<DiscogsDatabaseTypes.LabelReleasesResponse>): Client;
    getLabelReleases(label: number, callback: Callback<DiscogsDatabaseTypes.LabelReleasesResponse>): Client;
    getLabelReleases(label: number, params: PaginationOpts): Promise<DiscogsDatabaseTypes.LabelReleasesResponse>;
    getLabelReleases(label: number): Promise<DiscogsDatabaseTypes.LabelReleasesResponse>;

    getImage(url: string, callback: Callback<string>): Client;
    getImage(url: string): Promise<string>;

    search(query: string, params: DiscogsDatabaseTypes.SearchParams, callback: Callback<DiscogsDatabaseTypes.SearchResponse>): Client;
    search(query: string, callback: Callback<DiscogsDatabaseTypes.SearchResponse>): Client;
    search(params: DiscogsDatabaseTypes.SearchParams, callback: Callback<DiscogsDatabaseTypes.SearchResponse>): Client;

    search(query: string, params: DiscogsDatabaseTypes.SearchParams): Promise<DiscogsDatabaseTypes.SearchResponse>;
    search(params: DiscogsDatabaseTypes.SearchParams): Promise<DiscogsDatabaseTypes.SearchResponse>;
    search(query: string): Promise<DiscogsDatabaseTypes.SearchResponse>;
  }

  interface List {
    getItems(list: number, params: PaginationOpts, callback: Callback<ListsTypes.List>): Client
    getItems(list: number, callback: Callback<ListsTypes.List>): Client
    getItems(list: number, params: PaginationOpts): Promise<ListsTypes.List>
    getItems(list: number): Promise<ListsTypes.List>
  }

  type GetOrdersParams = PaginationOpts & SortingOpts<MarketplaceTypes.OrderSortKeys>
  interface Marketplace {
    getListing(listing: number, callback: Callback<UserTypes.Listing>): Client;
    getListing(listing: number): Promise<UserTypes.Listing>;

    addListing(data: MarketplaceTypes.AddListingData, callback: Callback<MarketplaceTypes.AddListingResponse>): Client;
    addListing(data: MarketplaceTypes.AddListingData): Promise<MarketplaceTypes.AddListingResponse>;

    editListing(listing: number, data: MarketplaceTypes.EditListingData, callback: Callback<EmptyResponse>): Client;
    editListing(listing: number, data: MarketplaceTypes.EditListingData): Promise<EmptyResponse>;

    deleteListing(listing: number, callback: Callback<EmptyResponse>): Client;
    deleteListing(listing: number): Promise<EmptyResponse>;

    getOrders(params: GetOrdersParams, callback: Callback<MarketplaceTypes.GetOrdersResponse>): Client;
    getOrders(callback: Callback<MarketplaceTypes.GetOrdersResponse>): Client;
    getOrders(params: GetOrdersParams): Promise<MarketplaceTypes.GetOrdersResponse>;
    getOrders(): Promise<MarketplaceTypes.GetOrdersResponse>;

    getOrder(order: string, callback: Callback<MarketplaceTypes.Order>): Client;
    getOrder(order: string): Promise<MarketplaceTypes.Order>;

    editOrder(order: string, data: MarketplaceTypes.EditOrderData, callback: Callback<MarketplaceTypes.Order>): Client;
    editOrder(order: string, data: MarketplaceTypes.EditOrderData): Promise<MarketplaceTypes.Order>;

    getOrderMessages(order: string, params: PaginationOpts, callback: Callback<MarketplaceTypes.GetOrderMessages>): Client;
    getOrderMessages(order: string, callback: Callback<MarketplaceTypes.GetOrderMessages>): Client;
    getOrderMessages(order: string, params: PaginationOpts): Promise<MarketplaceTypes.GetOrderMessages>;
    getOrderMessages(order: string): Promise<MarketplaceTypes.GetOrderMessages>;

    addOrderMessage(order: string, data: MarketplaceTypes.AddOrderMessageData, callback: Callback<MarketplaceTypes.Message>): Client;
    addOrderMessage(order: string, data: MarketplaceTypes.AddOrderMessageData): Promise<MarketplaceTypes.Message>;

    getFee(price: number, currency: string, callback: Callback<MarketplaceTypes.Fee>): Client;
    getFee(price: number, currency: string): Promise<MarketplaceTypes.Fee>;

    getPriceSuggestions(release: number, callback: Callback<MarketplaceTypes.PriceSuggestion>): Client
    getPriceSuggestions(release: number): Promise<MarketplaceTypes.PriceSuggestion>
  }

  interface Wantlist {
    getReleases(user: string, params: PaginationOpts, callback: Callback<WantlistTypes.GetWantlistResponse>): Client;
    getReleases(user: string, callback: Callback<WantlistTypes.GetWantlistResponse>): Client;
    getReleases(user: string, params: PaginationOpts): Promise<WantlistTypes.GetWantlistResponse>;
    getReleases(user: string): Promise<WantlistTypes.GetWantlistResponse>;

    addRelease(user: string, release: number, data: WantlistTypes.AddReleaseData, callback: Callback<WantlistTypes.Want>): Client;
    addRelease(user: string, release: number, callback: Callback<WantlistTypes.Want>): Client;
    addRelease(user: string, release: number, data: WantlistTypes.AddReleaseData): Promise<WantlistTypes.Want>;
    addRelease(user: string, release: number): Promise<WantlistTypes.Want>;

    editNotes(user: string, release: number, data: WantlistTypes.AddReleaseData, callback: Callback<WantlistTypes.Want>): Client;
    editNotes(user: string, release: number, data: WantlistTypes.AddReleaseData): Promise<WantlistTypes.Want>;

    removeRelease(user: string, release: number, callback: Callback<EmptyResponse>): Client;
    removeRelease(user: string, release: number): Promise<EmptyResponse>;
  }

  type GetInventoryParams = UserTypes.GetInventoryParams & SortingOpts<UserTypes.GetInventorySortingKeys> & PaginationOpts
  type GetContributionsParams = SortingOpts<UserTypes.GetContributionsSortingKeys> & PaginationOpts

  interface User {
    collection(): Collection;
    wantlist(): Wantlist;
    list(): List;

    getIdentity(callback: Callback<DiscogsTypes.Identity>): Client;
    getIdentity(): Promise<DiscogsTypes.Identity>;

    getProfile(user: string, callback: Callback<UserTypes.Profile>): Client;
    getProfile(user: string): Promise<UserTypes.Profile>;

    getInventory(user: string, params: GetInventoryParams, callback: Callback<UserTypes.GetInventoryResponse>): Client;
    getInventory(user: string, callback: Callback<UserTypes.GetInventoryResponse>): Client;
    getInventory(user: string, params: GetInventoryParams): Promise<UserTypes.GetInventoryResponse>;
    getInventory(user: string): Promise<UserTypes.GetInventoryResponse>;

    getContributions(user: string, params: GetContributionsParams, callback: Callback<UserTypes.GetContributionsResponse>): Client;
    getContributions(user: string, callback: Callback<UserTypes.GetContributionsResponse>): Client;
    getContributions(user: string, params: GetContributionsParams): Promise<UserTypes.GetContributionsResponse>;
    getContributions(user: string): Promise<UserTypes.GetContributionsResponse>;

    getSubmissions(user: string, callback: Callback<UserTypes.GetSubmissionsResponse>): Client;
    getSubmissions(user: string): Promise<UserTypes.GetSubmissionsResponse>;

    getLists(user: string, params: PaginationOpts, callback: Callback<UserTypes.GetListsResponse>): Client;
    getLists(user: string, callback: Callback<UserTypes.GetListsResponse>): Client;
    getLists(user: string, params: PaginationOpts): Promise<UserTypes.GetListsResponse>;
    getLists(user: string): Promise<UserTypes.GetListsResponse>;

  }

  interface Collection {
    getFolders(user: string, callback: Callback<CollectionTypes.UserFolders>): Client
    getFolders(user: string): Promise<CollectionTypes.UserFolders>

    getFolder(user: string, folder: number, callback: Callback<CollectionTypes.UserFolder>): Client
    getFolder(user: string, folder: number): Promise<CollectionTypes.UserFolder>

    addFolder(user: string, name: string, callback: Callback<CollectionTypes.UserFolder>): Client
    addFolder(user: string, name: string): Promise<CollectionTypes.UserFolder>

    setFolderName(user: string, folder: number, name: string, callback: Callback<CollectionTypes.UserFolder>): Client
    setFolderName(user: string, folder: number, name: string): Promise<CollectionTypes.UserFolder>

    deleteFolder(user: string, folder: number, callback: Callback<EmptyResponse>): Client
    deleteFolder(user: string, folder: number): Promise<EmptyResponse>

    getReleaseInstances(user: string, release: number, callback: Callback<CollectionTypes.ReleasesInstancesResponse>): Client
    getReleaseInstances(user: string, release: number): Promise<CollectionTypes.ReleasesInstancesResponse>

    getReleases(user: string, folder: number,
      params: SortingOpts<CollectionTypes.GetReleasesSortingKeys> & PaginationOpts, callback: Callback<CollectionTypes.ReleasesInstancesResponse>): Client
    getReleases(user: string, folder: number, callback: Callback<CollectionTypes.ReleasesInstancesResponse>): Client
    getReleases(user: string, folder: number,
      params: SortingOpts<CollectionTypes.GetReleasesSortingKeys> & PaginationOpts): Promise<CollectionTypes.ReleasesInstancesResponse>
    getReleases(user: string, folder: number): Promise<CollectionTypes.ReleasesInstancesResponse>

    addRelease(user: string, folder: number, release: number, callback: Callback<CollectionTypes.AddReleaseResponse>): Client
    addRelease(user: string, folder: number, release: number): Promise<CollectionTypes.AddReleaseResponse>

    editRelease(user: string, folder: number, release: number, instance: number, data: CollectionTypes.EditReleaseData, callback: Callback<EmptyResponse>): Client
    editRelease(user: string, folder: number, release: number, instance: number, data: CollectionTypes.EditReleaseData): Promise<EmptyResponse>

    removeRelease(user: string, folder: number, release: number, instance: number, callback: Callback<EmptyResponse>): Client
    removeRelease(user: string, folder: number, release: number, instance: number): Promise<EmptyResponse>
  }

  interface OAuthCallback {
    (err: any, auth: {
      method: AuthMethod;
      level: AuthLevel;
      authorizeUrl: string;
      token: string;
      tokenSecret: string;
      consumerKey: string;
      consumerSecret: string;
    }): void
  }

  interface OAuth {
    setConfig(customConfig: Object): OAuth;
    getRequestToken(consumerKey: string, consumerSecret: string, callbackUrl: string, callback: OAuthCallback): OAuth;
    getAccessToken(verifier: string, callback: OAuthCallback): OAuth;
  }

  export class Client {
    constructor();
    constructor(auth: Auth);
    constructor(userAgent: string);
    constructor(userAgent: string, auth: Auth);

    database(): Database;
    marketplace(): Marketplace;
    user(): User;

    oauth(): OAuth;

    about(): Promise<About>;
    about(callback: Callback<About>): Client;

    authenticated(level?: AuthLevel): boolean;

    getIdentity(callback: Callback<DiscogsTypes.Identity>): Client;
    getIdentity(): Promise<DiscogsTypes.Identity>;

    setConfig(customConfig: Config): Client;

    // get<T>(options: string, callback: Callback<T>): Client;
    // get<T>(options: GetOptions, callback: Callback<T>): Client;
    // get<T>(options: string): Promise<T>;
    // get<T>(options: GetOptions): Promise<T>;

    // post(options: any, data: any, callback: any): any;
    // put(options: any, data: any, callback: any): any;
    // delete(options: any, callback: any): any;
  }
}
