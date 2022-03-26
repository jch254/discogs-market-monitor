class RequestsExceededError extends Error {
  private _currentRequest = 0;
  private _currentListings: UserTypes.Listing[] = [];

  constructor(message: string, currentRequest: number, currentListings: UserTypes.Listing[]) {
    super(message);
    this.name = "RequestsExceededError";
    this.currentRequest = currentRequest;
    this.currentListings = currentListings;
  }

  get currentRequest() {
    return this._currentRequest;
  }

  set currentRequest(value: number) {
    this._currentRequest = value;
  }

  get currentListings() {
    return this._currentListings;
  }

  set currentListings(value: UserTypes.Listing[]) {
    this._currentListings = value;
  }
}