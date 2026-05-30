import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { Context } from 'aws-lambda';
import { listMonitors } from './monitorRepository';
import { debugLog } from './utils';

// Scheduled fan-out. Replaces the old single-user EventBridge schedule: lists
// every registered monitor and starts one isolated Step Functions execution per
// user. Per-user executions keep one user's failure from affecting another and
// keep each run within the Distributed Map concurrency limits.
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN || '';

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
  const enabled = monitors.filter(monitor => monitor.enabled !== false);

  console.log('DISPATCHING MARKET MONITOR RUNS', {
    total: monitors.length,
    enabled: enabled.length,
  });

  let started = 0;
  const failures: { username: string; message: string }[] = [];

  for (const monitor of enabled) {
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
