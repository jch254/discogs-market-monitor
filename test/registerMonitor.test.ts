import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendRegistrationConfirmationEmail, EmailSendError } from '../src/emailClient';
import { putMonitor } from '../src/monitorRepository';
import { startMonitorExecution } from '../src/monitorWorkflow';
import { handler } from '../src/registerMonitor';

vi.mock('../src/monitorRepository', () => ({
  getMonitor: vi.fn(),
  putMonitor: vi.fn(),
  deleteMonitor: vi.fn(),
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

const mockedPutMonitor = vi.mocked(putMonitor);
const mockedConfirmation = vi.mocked(sendRegistrationConfirmationEmail);
const mockedStartExecution = vi.mocked(startMonitorExecution);

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
});
