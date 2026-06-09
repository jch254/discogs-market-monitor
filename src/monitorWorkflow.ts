import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { Monitor } from './monitorRepository';

// Starts one isolated Step Functions execution for a single monitor. Shared by
// the scheduled dispatcher (fan-out every 12h) and the signup API (immediate
// first run on registration) so both build the execution name + input the same
// way.
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

export const startMonitorExecution = async (
  monitor: Pick<
    Monitor,
    'username' | 'shipsFrom' | 'destinationEmail' | 'discogsToken'
  >,
): Promise<void> => {
  if (!STATE_MACHINE_ARN) {
    throw new Error('STATE_MACHINE_ARN is not configured');
  }

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
};
