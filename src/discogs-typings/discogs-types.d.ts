declare namespace DiscogsTypes {

  interface Identity {
    username: string;
    resource_url: string;
    consumer_name: string;
    id: number;
  }
  
  interface ApiIndex {
    documentation_url: string;
    statistics: {
      labels: number;
      releases: number;
      artists: number;
    };
    hello: string;
    api_version: string;
  }

  interface Pagination {
    per_page: number;
    pages: number;
    page: number;
    urls: {
      last?: string;
      next?: string;
      prev?: string;
      first?: string;
    };
    items: number;
  }

}
