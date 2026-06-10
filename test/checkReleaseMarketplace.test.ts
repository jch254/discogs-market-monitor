import { Context } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '../src/checkReleaseMarketplace';
import { recordNewListing } from '../src/marketplaceListingStateRepository';
import { getReleaseListingIds } from '../src/marketplaceRss';
import {
  getReleaseCheckState,
  putReleaseCheckState,
  wasCheckedRecently,
} from '../src/releaseCheckStateRepository';
import { ScraperError } from '../src/scraperError';
import { getMarketplaceListing } from '../src/wrappedDiscogsClient';

vi.mock('../src/marketplaceRss', () => ({
  getReleaseListingIds: vi.fn(),
}));

vi.mock('../src/releaseCheckStateRepository', () => ({
  getReleaseCheckState: vi.fn(),
  putReleaseCheckState: vi.fn(),
  wasCheckedRecently: vi.fn(() => false),
}));

vi.mock('../src/marketplaceListingStateRepository', () => ({
  recordNewListing: vi.fn(async () => true),
}));

vi.mock('../src/wrappedDiscogsClient', () => ({
  getDiscogsClient: vi.fn(() => ({})),
  getMarketplaceListing: vi.fn(),
}));

const mockedGetIds = vi.mocked(getReleaseListingIds);
const mockedGetState = vi.mocked(getReleaseCheckState);
const mockedPutState = vi.mocked(putReleaseCheckState);
const mockedRecentlyChecked = vi.mocked(wasCheckedRecently);
const mockedRecord = vi.mocked(recordNewListing);
const mockedGetListing = vi.mocked(getMarketplaceListing);

const task = {
  userId: 'jordy',
  releaseId: 14756037,
  title: 'Khruangbin & Leon Bridges - Texas Sun',
  shipsFrom: 'New Zealand, Australia',
  destinationEmail: 'user@example.com',
};

const context = { awsRequestId: 'req-1' } as Context;

const makeListing = (shipsFrom: string): any => ({
  uri: 'https://discogs.example/listing',
  condition: 'Mint (M)',
  sleeve_condition: 'Mint (M)',
  comments: '',
  ships_from: shipsFrom,
  posted: '2026-06-01',
  original_price: { formatted: '$10', curr_abbr: 'NZD' },
  original_shipping_price: { value: 5, currency: 'NZD' },
  shipping_price: { value: 5, currency: 'NZD' },
  release: {
    id: 14756037,
    artist: 'Khruangbin',
    title: 'Texas Sun',
    description: 'desc',
    format: 'LP',
    year: 2020,
    thumbnail: '',
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedRecentlyChecked.mockReturnValue(false);
  mockedGetState.mockResolvedValue(undefined);
  mockedRecord.mockResolvedValue(true);
  mockedGetListing.mockResolvedValue(makeListing('New Zealand'));
});

describe('checkReleaseMarketplace handler', () => {
  it('updates check state after a successful scrape', async () => {
    mockedGetIds.mockResolvedValue(['1', '2']);

    const result = await handler(task, context);

    expect(result).toEqual({
      releaseId: task.releaseId,
      title: task.title,
      newListingCount: 2,
    });
    expect(mockedPutState).toHaveBeenCalledWith({
      userId: 'jordy',
      releaseId: 14756037,
      lastSeenListingIds: ['1', '2'],
    });
  });

  it('treats a successful zero-listing scrape as a successful check', async () => {
    mockedGetIds.mockResolvedValue([]);

    const result = await handler(task, context);

    expect(result.newListingCount).toBe(0);
    expect(mockedPutState).toHaveBeenCalledWith({
      userId: 'jordy',
      releaseId: 14756037,
      lastSeenListingIds: [],
    });
  });

  it('does not update check state when the scrape fails, and rethrows for the Map', async () => {
    mockedGetIds.mockRejectedValue(
      new ScraperError('blocked', {
        releaseId: task.releaseId,
        status: 403,
        reason: 'sell page returned HTTP 403',
      }),
    );

    await expect(handler(task, context)).rejects.toThrow('blocked');

    expect(mockedPutState).not.toHaveBeenCalled();
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it('skips releases that were checked recently without scraping', async () => {
    mockedGetState.mockResolvedValue({
      userId: 'jordy',
      releaseId: '14756037',
      lastCheckedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    });
    mockedRecentlyChecked.mockReturnValue(true);

    const result = await handler(task, context);

    expect(result.newListingCount).toBe(0);
    expect(mockedGetIds).not.toHaveBeenCalled();
    expect(mockedPutState).not.toHaveBeenCalled();
  });

  it('only fetches listings not previously seen and stays idempotent on retries', async () => {
    mockedGetState.mockResolvedValue({
      userId: 'jordy',
      releaseId: '14756037',
      lastCheckedAt: '2026-06-01T00:00:00.000Z',
      lastUpdatedAt: '2026-06-01T00:00:00.000Z',
      lastSeenListingIds: ['1'],
    });
    mockedGetIds.mockResolvedValue(['1', '2']);
    // Already recorded on a previous (timed out) attempt: conditional put says
    // "not new".
    mockedRecord.mockResolvedValue(false);

    const result = await handler(task, context);

    expect(mockedGetListing).toHaveBeenCalledTimes(1);
    expect(mockedGetListing).toHaveBeenCalledWith({}, '2', 1);
    expect(result.newListingCount).toBe(0);
  });

  it('excludes listings whose detail fetch failed from the persisted seen set', async () => {
    mockedGetIds.mockResolvedValue(['1', '2', '3']);
    mockedGetListing
      .mockResolvedValueOnce(makeListing('New Zealand'))
      .mockRejectedValueOnce(new Error('listing fetch exploded'))
      .mockResolvedValueOnce(makeListing('New Zealand'));

    const result = await handler(task, context);

    expect(result.newListingCount).toBe(2);
    expect(mockedPutState).toHaveBeenCalledWith({
      userId: 'jordy',
      releaseId: 14756037,
      lastSeenListingIds: ['1', '3'],
    });
  });

  it('filters listings by ships-from country', async () => {
    mockedGetIds.mockResolvedValue(['1', '2']);
    mockedGetListing
      .mockResolvedValueOnce(makeListing('Germany'))
      .mockResolvedValueOnce(makeListing('Australia'));

    const result = await handler(task, context);

    expect(result.newListingCount).toBe(1);
    expect(mockedRecord).toHaveBeenCalledTimes(1);
    // Both listings were successfully checked, so both are now "seen".
    expect(mockedPutState).toHaveBeenCalledWith({
      userId: 'jordy',
      releaseId: 14756037,
      lastSeenListingIds: ['1', '2'],
    });
  });
});
