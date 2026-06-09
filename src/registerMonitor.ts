import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { deleteMonitor, getMonitor, putMonitor } from './monitorRepository';
import { startMonitorExecution } from './monitorWorkflow';
import { sendRegistrationConfirmationEmail } from './emailClient';

// Self-service signup API. A prospective user POSTs their Discogs username, the
// countries they want to watch and where to email the digest; this registers a
// monitor that the scheduled dispatcher will run every cycle. DELETE removes a
// monitor (unsubscribe).
//
// Notes:
// - Validation is intentionally lightweight (boundary checks only).
// - destinationEmail is not verified here; treat the endpoint as untrusted and
//   front it with throttling/WAF or an API key for production abuse-resistance.

const json = (
  statusCode: number,
  body: unknown,
): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9._-]{1,60}$/;

interface RegisterBody {
  username?: unknown;
  shipsFrom?: unknown;
  destinationEmail?: unknown;
  discogsToken?: unknown;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method ?? 'POST';

  if (method === 'DELETE') {
    const username = event.pathParameters?.username;

    if (!isNonEmptyString(username)) {
      return json(400, { message: 'username path parameter is required' });
    }

    const existing = await getMonitor(username);

    if (!existing) {
      return json(404, { message: 'monitor not found' });
    }

    await deleteMonitor(username);

    return json(200, { message: 'monitor removed', username });
  }

  let body: RegisterBody;

  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { message: 'request body must be valid JSON' });
  }

  const errors: string[] = [];

  if (!isNonEmptyString(body.username) || !USERNAME_RE.test(body.username.trim())) {
    errors.push('username is required and must be a valid Discogs username');
  }

  if (!isNonEmptyString(body.shipsFrom)) {
    errors.push(
      'shipsFrom is required (one or more countries, comma separated)',
    );
  }

  if (
    !isNonEmptyString(body.destinationEmail) ||
    !EMAIL_RE.test(body.destinationEmail.trim())
  ) {
    errors.push('destinationEmail is required and must be a valid email');
  }

  if (
    body.discogsToken !== undefined &&
    !isNonEmptyString(body.discogsToken)
  ) {
    errors.push('discogsToken, when provided, must be a non-empty string');
  }

  if (errors.length > 0) {
    return json(400, { message: 'validation failed', errors });
  }

  const monitor = await putMonitor({
    username: (body.username as string).trim(),
    shipsFrom: (body.shipsFrom as string).trim(),
    destinationEmail: (body.destinationEmail as string).trim(),
    discogsToken: isNonEmptyString(body.discogsToken)
      ? body.discogsToken.trim()
      : undefined,
  });

  // Best-effort confirmation email. The monitor is already stored, so never
  // fail registration if the send fails (e.g. transient Resend error).
  try {
    await sendRegistrationConfirmationEmail(
      monitor.destinationEmail,
      monitor.username,
      monitor.shipsFrom,
    );
  } catch (error: any) {
    console.error('Failed to send registration confirmation email', error);
  }

  // Kick off an immediate first run so the user gets their initial digest now
  // rather than waiting up to 12h for the next scheduled dispatch. Best-effort:
  // the monitor is stored and the schedule will pick it up regardless.
  try {
    await startMonitorExecution(monitor);
  } catch (error: any) {
    console.error('Failed to start initial monitor run', error);
  }

  // Never echo the stored token back to the caller.
  const { discogsToken, ...safe } = monitor;

  return json(200, {
    message: 'monitor registered',
    monitor: { ...safe, hasDiscogsToken: Boolean(discogsToken) },
  });
}
