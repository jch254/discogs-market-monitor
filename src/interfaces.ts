export interface DiscogsPagination {
  page: number;
  pages: number;
  items: number;
  per_page: number;
  urls: {
    first: string;
    prev: string;
    next: string;
    last: string;
  };
}

export interface DiscogsWantlistItemFormat {
  name: string;
  qty: number;
  text: string;
  descriptions: string[];
}

export interface DiscogsWantlistItemLabel {
  name: string;
  catno: string;
  entity_type: string;
  entity_type_name: string;
  id: number;
  resource_url: string;
}

export interface DiscogsWantlistItemArtist {
  name: string;
  anv: string;
  join: string;
  role: string;
  tracks: string;
  id: number;
  resource_url: string;
}

export interface DiscogsWantlistItem {
  id: number;
  resource_url: string;
  rating: number;
  date_added: string;
  basic_information: {
    id: number;
    master_id: number;
    master_url: string;
    resource_url: string;
    title: string;
    year: number;
    formats: DiscogsWantlistItemFormat[];
    labels: DiscogsWantlistItemLabel[];
    artists: DiscogsWantlistItemArtist[];
    thumb: string;
    cover_image: string;
    genres: string[];
    styles: [];
  };
  notes: "";
}
