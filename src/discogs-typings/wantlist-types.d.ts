declare namespace WantlistTypes {

  interface GetWantlistResponse {
    pagination: DiscogsTypes.Pagination;
    wants: Want[]
  }

  interface Want {
    rating: number;
    resource_url: string;
    basic_information: BasicInformation;
    id: number;
    date_added: string;
    notes?: string;
  }

  interface BasicInformation {
    labels: Label[];
    year: number;
    master_url: null | string;
    artists: Artist[];
    id: number;
    thumb: string;
    title: string;
    formats: Format[];
    cover_image: string;
    resource_url: string;
    master_id: number | null;
  }

  interface Format {
    descriptions?: string[];
    name: string;
    qty: string;
    text?: string;
  }

  interface Label {
    name: string;
    entity_type: string;
    catno: string;
    resource_url: string;
    id: number;
    entity_type_name: string;
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

  interface AddReleaseData {
    notes?: string;
    rating?: number;
  }
}