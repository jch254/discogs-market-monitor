declare namespace CollectionTypes {

  type GetReleasesSortingKeys = "label" | "artist" | "title" | "catno" | "format" | "rating" | "added" | "year"

  interface UserFolders {
    folders: UserFolder[]
  }

  interface UserFolder {
    id: number;
    count: number;
    name: string;
    resource_url: string;
  }

  interface ReleasesInstancesResponse {
    pagination: DiscogsTypes.Pagination,
    releases: ReleaseInstance[]
  }

  interface ReleaseInstance {
    instance_id: number;
    date_added: Date;
    basic_information: BasicInformation;
    id: number;
    rating: number;
    notes?: Note[] // for the owners
  }

  interface Note {
    field_id: number;
    value: string;
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
    master_id: number;
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

  interface AddReleaseResponse {
    instance_id: number;
    resource_url: string;
  }

  interface EditReleaseData {
    rating: number;
    folder_id: number;
  }
}
