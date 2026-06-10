import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendRegistrationConfirmationEmail, EmailSendError } from '../src/emailClient';
import { deleteMonitor, getMonitor, putMonitor } from '../src/monitorRepository';
import { startMonitorExecution } from '../src/monitorWorkflow';
import { handler } from '../src/registerMonitor';
import { purgeUserState } from '../src/userStateRepository';

vi.mock('../src/monitorRepository', () => ({
  getMonitor: vi.fn(),
  putMonitor: vi.fn(),
  deleteMonitor: vi.fn(),
}));

vi.mock('../src/userStateRepository', () => ({
  purgeUserState: vi.fn(),
}));

vi.mock('../src/monitorWorkflow', () => ({
  startMonitorExecution: vi.fn(async () => undefined),
}));

vi.mock('../src/emailClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/emailClient')>();

  return {
    EmailSendError: actual.EmailSendError,
    sendRegistrationConfirmationEmail: vi.fn(),
    sendWantlistDigestEmail: vi.fn(),
  };
});

const mockedGetMonitor = vi.mocked(getMonitor);
const mockedPutMonitor = vi.mocked(putMonitor);
const mockedDeleteMonitor = vi.mocked(deleteMonitor);
const mockedConfirmation = vi.mocked(sendRegistrationConfirmationEmail);
const mockedStartExecution = vi.mocked(startMonitorExecution);
const mockedPurgeUserState = vi.mocked(purgeUserState);

const DESTINATION = 'private-address@example.com';

const postEvent = (): APIGatewayProxyEventV2 =>
  ({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      username: 'jordy',
      shipsFrom: 'New Zealand',
      destinationEmail: DESTINATION,
    }),
  }) as any;

const deleteEvent = (username: string): APIGatewayProxyEventV2 =>
  ({
    requestContext: { http: { method: 'DELETE' } },
    pathParameters: { username },
  }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockedPutMonitor.mockResolvedValue({
    username: 'jordy',
    shipsFrom: 'New Zealand',
    destinationEmail: DESTINATION,
  } as any);
  mockedConfirmation.mockResolvedValue({ id: 'resend-1' });
});

describe('registerMonitor handler', () => {
  it('registers a monitor and starts an immediate first run', async () => {
    const response: any = await handler(postEvent());

    expect(response.statusCode).toBe(200);
    expect(mockedPutMonitor).toHaveBeenCalledTimes(1);
    expect(mockedStartExecution).toHaveBeenCalledTimes(1);
  });

  it('still registers when the confirmation email fails, logging safely', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mockedConfirmation.mockRejectedValue(
      new EmailSendError('confirmation', 'validation_error'),
    );

    const response: any = await handler(postEvent());

    expect(response.statusCode).toBe(200);
    expect(mockedStartExecution).toHaveBeenCalledTimes(1);

    // The failure is logged, but the logged payload must never contain the
    // destination email address.
    expect(consoleError).toHaveBeenCalled();
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain(DESTINATION);
  });

  it('purges the user state partition on unregister, keyed by stored casing', async () => {
    mockedGetMonitor.mockResolvedValue({
      username: 'Jordy',
      shipsFrom: 'New Zealand',
      destinationEmail: DESTINATION,
    } as any);
    mockedPurgeUserState.mockResolvedValue(42);

    const response: any = await handler(deleteEvent('jordy'));

    expect(response.statusCode).toBe(200);
    // State rows are keyed by the username as stored, not the path parameter.
    expect(mockedPurgeUserState).toHaveBeenCalledWith('Jordy');
    expect(mockedDeleteMonitor).toHaveBeenCalledWith('jordy');
    expect(JSON.parse(response.body)).toMatchObject({ purgedStateRows: 42 });
  });

  it('keeps the monitor when the purge fails so the DELETE can be retried', async () => {
    mockedGetMonitor.mockResolvedValue({
      username: 'jordy',
      shipsFrom: 'New Zealand',
      destinationEmail: DESTINATION,
    } as any);
    mockedPurgeUserState.mockRejectedValue(new Error('throttled'));

    await expect(handler(deleteEvent('jordy'))).rejects.toThrow('throttled');

    expect(mockedDeleteMonitor).not.toHaveBeenCalled();
  });

  it('does not purge anything for an unknown username', async () => {
    mockedGetMonitor.mockResolvedValue(undefined);

    const response: any = await handler(deleteEvent('ghost'));

    expect(response.statusCode).toBe(404);
    expect(mockedPurgeUserState).not.toHaveBeenCalled();
    expect(mockedDeleteMonitor).not.toHaveBeenCalled();
  });
});
