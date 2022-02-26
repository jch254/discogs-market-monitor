declare namespace MarketplaceTypes {

  type Condition =
    | "Mint (M)"
    | "Near Mint (NM or M-)"
    | "Very Good Plus (VG+)"
    | "Very Good (VG)"
    | "Good Plus (G+)"
    | "Good (G)"
    | "Fair (F)"
    | "Poor (P)"

  type SleeveCondition =
    | "Mint (M)"
    | "Near Mint (NM or M-)"
    | "Very Good Plus (VG+)"
    | "Very Good (VG)"
    | "Good Plus (G+)"
    | "Good (G)"
    | "Fair (F)"
    | "Poor (P)"
    | "Generic"
    | "Not Graded"
    | "No Cover"

  type OrderStatus =
    | "All"
    | "New Order"
    | "Buyer Contacted"
    | "Invoice Sent"
    | "Payment Pending"
    | "Payment Received"
    | "Shipped"
    | "Merged"
    | "Order Changed"
    | "Refund Sent"
    | "Cancelled"
    | "Cancelled (Non-Paying Buyer)"
    | "Cancelled (Item Unavailable)"
    | "Cancelled (Per Buyer's Request)"
    | "Cancelled (Refund Received)"

  type OrderSortKeys =
    | "id"
    | "buyer"
    | "created"
    | "status"
    | "last_activity"


  interface AddListingData {
    release_id: number,
    condition: Condition,
    sleeve_condition?: SleeveCondition,
    price: number,
    comments?: string,
    allow_offers?: boolean,
    status: string,
    external_id?: string,
    location?: string,
    weight?: number,
    format_quantity?: number
  }

  interface EditListingData extends AddListingData {
    listing_id: number
  }

  interface AddListingResponse {
    listing_id: number;
    resource_url: string
  }

  interface Fee {
    value: number,
    currency: string,
  }

  interface PriceSuggestion extends Record<Condition, Fee> { }

  interface GetOrdersResponse {
    pagination: DiscogsTypes.Pagination;
    orders: Order[];
  }

  interface Order {
    status: OrderStatus;
    fee: Fee;
    created: string;
    items: OrderListing[];
    shipping: Shipping;
    shipping_address: string;
    additional_instructions: string;
    seller: User;
    last_activity: string;
    buyer: User;
    total: Fee;
    id: string;
    resource_url: string;
    messages_url: string;
    uri: string;
    next_status: OrderStatus[];
    tracking: {};
    tax: any[];
    feedback: Feedback;
  }

  interface Feedback {
    for_buyer?: {
      url: string,
      resource_url: string,
      eligible: boolean
    }
  }

  interface User {
    resource_url: string;
    username: string;
    id: number;
  }

  interface OrderListing {
    release: OrderListingRelease;
    sleeve_condition?: SleeveCondition;
    condition_comments?: string;
    media_condition?: string;
    price: Fee;
    id: number;
  }

  interface OrderListingRelease {
    id: number;
    description: string;
    resource_url: string;
    thumbnail: string;
  }

  interface Shipping {
    currency: string;
    method: string;
    value: number;
  }

  interface EditOrderData {
    order_id: number,
    status?: OrderStatus,
    shipping?: number
  }

  interface GetOrderMessages {
    pagination: DiscogsTypes.Pagination;
    messages: Message[];
  }

  interface Message {
    refund?: Refund;
    timestamp: string;
    message: string;
    type: string;
    order: MessageOrder;
    subject: string;
    from?: From;
    status_id?: number;
    actor?: Actor;
    original?: number;
    new?: number;
  }

  interface Actor {
    username: string;
    resource_url: string;
  }

  interface From {
    id: number;
    username: string;
    avatar_url: string;
    resource_url: string;
  }

  interface MessageOrder {
    resource_url: string;
    id: string;
  }

  interface Refund {
    amount: number;
    order: MessageOrder;
  }

  interface AddOrderMessageData {
    message: string,
    status: OrderStatus
  }

}