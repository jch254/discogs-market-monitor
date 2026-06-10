import { Context } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendWantlistDigestEmail, EmailSendError } from '../src/emailClient';
import {
  getUnnotifiedListings,
  markListingsNotified,
} from '../src/marketplaceListingStateRepository';
import { handler } from '../src/sendDigest';

vi.mock('../src/emailClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/emailClient')>();

  return {
    EmailSendError: actual.EmailSendError,
    sendWantlistDigestEmail: vi.fn(),
    sendRegistrationConfirmationEmail: vi.fn(),
  };
});

vi.mock('../src/marketplaceListingStateRepository', () => ({
  getUnnotifiedListings: vi.fn(),
  markListingsNotified: vi.fn(async () => undefined),
}));

const mockedSend = vi.mocked(sendWantlistDigestEmail);
const mockedGetUnnotified = vi.mocked(getUnnotifiedListings);
const mockedMarkNotified = vi.mocked(markListingsNotified);

const event = {
  username: 'jordy',
  shipsFrom: 'New Zealand',
  destinationEmail: 'private-address@example.com',
};

const context = { awsRequestId: 'req-1' } as Context;

const unnotifiedRow = (listingId: string): any => ({
  userId: 'jordy',
  listingId,
  releaseId: '14756037',
  listing: { title: 'Texas Sun', artist: 'Khruangbin' },
  notified: false,
  firstSeenAt: '2026-06-10T00:00:00.000Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedSend.mockResolvedValue({ id: 'resend-123' });
});

describe('sendDigest handler', () => {
  it('skips sending when there are no un-notified listings', async () => {
    mockedGetUnnotified.mockResolvedValue([]);

    await handler(event, context);

    expect(mockedSend).not.toHaveBeenCalled();
    expect(mockedMarkNotified).not.toHaveBeenCalled();
  });

  it('marks listings notified only after a confirmed successful send', async () => {
    mockedGetUnnotified.mockResolvedValue([
      unnotifiedRow('1'),
      unnotifiedRow('2'),
    ]);

    await handler(event, context);

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedMarkNotified).toHaveBeenCalledWith('jordy', ['1', '2']);
    expect(
      mockedSend.mock.invocationCallOrder[0],
    ).toBeLessThan(mockedMarkNotified.mock.invocationCallOrder[0]);
  });

  it('does not mark listings notified when the send fails, and fails the Lambda', async () => {
    mockedGetUnnotified.mockResolvedValue([unnotifiedRow('1')]);
    mockedSend.mockRejectedValue(new EmailSendError('digest', 'application_error'));

    await expect(handler(event, context)).rejects.toThrow(EmailSendError);

    expect(mockedMarkNotified).not.toHaveBeenCalled();
  });

  it('a retry after a failed send re-sends the same listings without dropping any', async () => {
    mockedGetUnnotified.mockResolvedValue([unnotifiedRow('1')]);
    mockedSend.mockRejectedValueOnce(
      new EmailSendError('digest', 'application_error'),
    );

    await expect(handler(event, context)).rejects.toThrow(EmailSendError);
    expect(mockedMarkNotified).not.toHaveBeenCalled();

    // Step Functions retry: the listing is still un-notified, gets re-sent and
    // only then marked.
    await handler(event, context);

    expect(mockedSend).toHaveBeenCalledTimes(2);
    expect(mockedMarkNotified).toHaveBeenCalledTimes(1);
    expect(mockedMarkNotified).toHaveBeenCalledWith('jordy', ['1']);
  });

  it('a retry after a successful run sends nothing new (idempotent)', async () => {
    mockedGetUnnotified.mockResolvedValueOnce([unnotifiedRow('1')]);

    await handler(event, context);

    // Listings were marked notified, so the retry reads an empty ledger.
    mockedGetUnnotified.mockResolvedValueOnce([]);

    await handler(event, context);

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedMarkNotified).toHaveBeenCalledTimes(1);
  });
});
