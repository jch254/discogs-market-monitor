declare namespace ListsTypes {

  interface List {
    description: string;
    user: User;
    date_added: string;
    id: number;
    name: string;
    items: Item[];
    uri: string;
    image_url: string;
    date_changed: string;
    resource_url: string;
    public: boolean;
  }

  export interface Item {
    comment: string;
    display_title: string;
    uri: string;
    image_url: string;
    resource_url: string;
    type: "label" | "master" | "release";
    id: number;
    stats?: Stats;
  }

  export interface Stats {
    user: Community;
    community: Community;
  }

  export interface Community {
    in_collection: number;
    in_wantlist: number;
  }

  export interface User {
    username: string;
    resource_url: string;
    avatar_url: string;
    id: number;
  }

}