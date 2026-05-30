import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { Context } from 'aws-lambda';
import {
  DEFAULT_FREQUENCY_HOURS,
  listMonitors,
  markDispatched,
  Monitor,
} from './monitorRepository';
import { debugLog } from './utils';

// Scheduled fan-out. Replaces the old single-user EventBridge schedule: lists
// every registered monitor and starts one isolated Step Functions execution per
// user. Per-user executions keep one user's failure from affecting another and
// keep each run within the Distributed Map concurrency limits.
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN || '';

// Tolerance for scheduler jitter so a monitor isn't pushed to the next tick
// just because the schedule fired a few minutes early/late.
const DISPATCH_SLACK_MS = 5 * 60 * 1000;

// A monitor is due when it has never run, or enough time has elapsed since its
// last dispatch to satisfy the user's configured frequency.
export const isDue = (monitor: Monitor, now: number): boolean => {
  if (!monitor.lastDispatchedAt) {
    return true;
  }

  const last = Date.parse(monitor.lastDispatchedAt);

  if (Number.isNaN(last)) {
    return true;
  }

  const frequencyMs =
    (monitor.frequencyHours || DEFAULT_FREQUENCY_HOURS) * 60 * 60 * 1000;

  return now - last >= frequencyMs - DISPATCH_SLACK_MS;
};

let sfnClient: SFNClient | undefined;

const getSfnClient = () => {
  if (!sfnClient) {
    sfnClient = new SFNClient({});
  }

  return sfnClient;
};

// Step Functions execution names must be <= 80 chars and use a limited charset.
const safeExecutionName = (username: string) => {
  const slug = username.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 40);

  return `monitor-${slug}-${Date.now()}`;
};

export async function handler(_event: unknown, _context: Context) {
  if (!STATE_MACHINE_ARN) {
    throw new Error('STATE_MACHINE_ARN is not configured');
  }

  const monitors = await listMonitors();
  const now = Date.now();
  const due = monitors.filter(
    monitor => monitor.enabled !== false && isDue(monitor, now),
  );

  console.log('DISPATCHING MARKET MONITOR RUNS', {
    total: monitors.length,
    due: due.length,
  });

  let started = 0;
  const failures: { username: string; message: string }[] = [];

  for (const monitor of due) {
    try {
      await getSfnClient().send(
        new StartExecutionCommand({
          stateMachineArn: STATE_MACHINE_ARN,
          name: safeExecutionName(monitor.username),
          input: JSON.stringify({
            username: monitor.username,
            shipsFrom: monitor.shipsFrom,
            destinationEmail: monitor.destinationEmail,
            discogsToken: monitor.discogsToken,
          }),
        }),
      );

      started += 1;

      // Stamp the dispatch time so the next tick honours this user's frequency.
      await markDispatched(monitor.username, new Date(now).toISOString());

      debugLog('STARTED MARKET MONITOR EXECUTION', {
        username: monitor.username,
      });
    } catch (error: any) {
      // Isolate per-user failures so one bad config never blocks other users.
      console.log('FAILED TO START MARKET MONITOR EXECUTION', {
        username: monitor.username,
        message: error?.message,
      });

      failures.push({ username: monitor.username, message: error?.message });
    }
  }

  return { dispatched: started, failures };
}
