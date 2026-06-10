import { beforeEach, describe, expect, it, vi } from 'vitest';

const resend = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('resend', () => ({
  // Constructed with `new`, so it must be a regular function, not an arrow.
  // tslint:disable-next-line:ter-prefer-arrow-callback
  Resend: vi.fn(function resendClient() {
    return { emails: { send: resend.send } };
  }),
}));

import {
  sendRegistrationConfirmationEmail,
  sendWantlistDigestEmail,
  EmailSendError,
} from '../src/emailClient';

const DESTINATION = 'private-address@example.com';

beforeEach(() => {
  resend.send.mockReset();
});

describe('sendWantlistDigestEmail', () => {
  it('returns the Resend id on success', async () => {
    resend.send.mockResolvedValue({ data: { id: 'resend-123' }, error: null });

    await expect(
      sendWantlistDigestEmail(DESTINATION, 'jordy', 'New Zealand', []),
    ).resolves.toEqual({ id: 'resend-123' });
  });

  it('throws when Resend returns { error } instead of throwing', async () => {
    resend.send.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        message: `Invalid to field: ${DESTINATION}`,
      },
    });

    await expect(
      sendWantlistDigestEmail(DESTINATION, 'jordy', 'New Zealand', []),
    ).rejects.toThrow(EmailSendError);
  });

  it('never leaks the destination email in the thrown error', async () => {
    resend.send.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        message: `Invalid to field: ${DESTINATION}`,
      },
    });

    const error = await sendWantlistDigestEmail(
      DESTINATION,
      'jordy',
      'New Zealand',
      [],
    ).catch(e => e);

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error.message).not.toContain(DESTINATION);
    expect(error.message).toContain('validation_error');
    expect(error.resendErrorName).toBe('validation_error');
  });
});

describe('sendRegistrationConfirmationEmail', () => {
  it('returns the Resend id on success', async () => {
    resend.send.mockResolvedValue({ data: { id: 'resend-456' }, error: null });

    await expect(
      sendRegistrationConfirmationEmail(DESTINATION, 'jordy', 'New Zealand'),
    ).resolves.toEqual({ id: 'resend-456' });
  });

  it('throws an address-free EmailSendError when Resend reports an error', async () => {
    resend.send.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: `Slow down ${DESTINATION}` },
    });

    const error = await sendRegistrationConfirmationEmail(
      DESTINATION,
      'jordy',
      'New Zealand',
    ).catch(e => e);

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error.message).not.toContain(DESTINATION);
    expect(error.message).toContain('rate_limit_exceeded');
  });
});
