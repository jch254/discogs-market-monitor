import { Context } from 'aws-lambda';
import { listMonitors } from './monitorRepository';
import { startMonitorExecution } from './monitorWorkflow';
import { debugLog } from './utils';

// Scheduled fan-out. Replaces the old single-user EventBridge schedule: lists
// every registered monitor and starts one isolated Step Functions execution per
// user. Per-user executions keep one user's failure from affecting another and
// keep each run within the Distributed Map concurrency limits.

export async function handler(_event: unknown, _context: Context) {
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
      await startMonitorExecution(monitor);

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
