// Minimal structured logging: one JSON object per line so CloudWatch Logs
// Insights can filter on `event` and the other fields directly.
//
// Safe-fields policy: callers may log identifiers, counts, durations, attempt
// numbers, HTTP statuses, profile names and short reason strings. Never log
// Discogs tokens, the Resend API key, cookies, HTTP headers, raw HTML bodies,
// destination email addresses or full listing payloads.

export type LogFields = Record<
  string,
  string | number | boolean | null | undefined
>;

export const logEvent = (event: string, fields: LogFields = {}): void => {
  console.log(JSON.stringify({ event, ...fields }));
};
