import { TransformedListing } from "./interfaces";

export class RequestsExceededError extends Error {
  private _currentIndex = 0;
  private _currentListings: TransformedListing[] = [];

  constructor(message: string, currentIndex: number, currentListings: TransformedListing[]) {
    super(message);
    this.name = "RequestsExceededError";
    this.currentIndex = currentIndex;
    this.currentListings = currentListings;
  }

  get currentIndex() {
    return this._currentIndex;
  }

  set currentIndex(value: number) {
    this._currentIndex = value;
  }

  get currentListings() {
    return this._currentListings;
  }

  set currentListings(value: TransformedListing[]) {
    this._currentListings = value;
  }
}