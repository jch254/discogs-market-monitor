import { Context, ScheduledEvent } from 'aws-lambda';

export async function handler(event: ScheduledEvent, context: Context) {
  console.log('pingHandler');
  console.log('event', JSON.stringify(event));
  console.log('context', JSON.stringify(context));
}
