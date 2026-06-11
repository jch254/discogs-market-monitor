# [Discogs Wantlist Marketplace Monitor](https://discogs.603.nz)

![Build Status](https://codebuild.ap-southeast-2.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiUDhXeDRQQlY5UXRDRDY1RHVDSm5sK1d6TEp0UDR0QTl3QXE4V0NoZkZKZFZ6SVp3WUJBSFVtdW9iMm5CQlVzbVl5b2hHZi8zUEptZGMzdmo3b0JOcHlZPSIsIml2UGFyYW1ldGVyU3BlYyI6Inh5aTgyT0NBa2VnVmxtVFkiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=master)

Discogs Wantlist Marketplace Monitor powered by Serverless, Step Functions, TypeScript and Node.js. The monitor scans the Discogs Marketplace for listings from the specified user's wantlist in the specified countries and sends a digest email of newly-seen matching listings to the specified email address. It runs as an AWS Step Functions workflow — immediately when you sign up, then on a schedule every twelve hours via EventBridge. This saves manually searching through your wantlist for local listings.

Processing is incremental and rate-limit-safe: each release is checked independently, results are deduped in DynamoDB, and only newly-seen listings are emailed.

It is multi-tenant: anyone can self-register their own monitor via a small HTTP API. Registering runs the workflow immediately for that user, and a scheduled dispatcher then re-runs it independently for every registered user every twelve hours.

## Sign up (register your own monitor)

The deployed service exposes an HTTP API so users can set up their own monitor without touching infrastructure or SSM parameters.

Register (or update) a monitor:

```bash
curl -X POST https://<your-api-host>/monitors \
  -H 'content-type: application/json' \
  -d '{
    "username": "your_discogs_username",
    "shipsFrom": "Australia, New Zealand",
    "destinationEmail": "you@internet.com",
    "discogsToken": "optional_personal_access_token"
  }'
```

- `username` (required) — your Discogs username; its wantlist is scanned.
- `shipsFrom` (required) — one or more countries, comma separated.
- `destinationEmail` (required) — where the digest is emailed.
- `discogsToken` (optional) — a [Discogs personal access token](https://www.discogs.com/settings/developers). Required only to read a **private** wantlist; public wantlists work without it (the shared service token is used as a fallback). The token is stored but never returned by the API.

The endpoint upserts by username, so re-posting updates your config. Posting prints the stored config back (with `hasDiscogsToken` instead of the secret), sends a confirmation email, and kicks off an immediate first run so you don't wait up to twelve hours for your first digest.

Unsubscribe:

```bash
curl -X DELETE https://<your-api-host>/monitors/your_discogs_username
```

Unsubscribing also purges the user's stored workflow state (release-check state and the listing ledger), so re-registering later starts from a clean slate — the first run after re-registration behaves like a fresh full scan.

After Serverless deploys, the API host is printed in the stack outputs (the `httpApi` endpoint).

> The signup endpoint is unauthenticated for simplicity. For a public production deployment, front it with throttling/WAF or an API key and verify `destinationEmail` to prevent abuse.

## Frontend (signup UI)

A small self-service web UI for the same `POST /monitors` / `DELETE /monitors/{username}` API is hosted at **[discogs.603.nz](https://discogs.603.nz)** — register or unsubscribe a monitor without touching `curl`. It's a separate [Astro](https://astro.build) + Tailwind static site (private S3 served by CloudFront, TLS via ACM, DNS in Cloudflare) with its own Terraform stack and CI pipeline. The API base URL is baked in at build time via `PUBLIC_API_BASE_URL`. See [/frontend](./frontend) and [/frontend/infrastructure](./frontend/infrastructure).

## Technologies Used

- [Serverless](https://github.com/serverless/serverless)
- [Serverless Step Functions](https://github.com/serverless-operations/serverless-step-functions)
- [AWS Step Functions](https://aws.amazon.com/step-functions/) (Distributed Map)
- [Amazon DynamoDB](https://aws.amazon.com/dynamodb/)
- [TypeScript](https://github.com/microsoft/typescript)
- [Node.js](https://github.com/nodejs/node)
- [Disconnect](https://github.com/bartve/disconnect)
- [node-tls-client](https://github.com/Sahil1337/node-tls-client) (browser-TLS fetch of Discogs sell pages)
- [Resend](https://github.com/resendlabs/resend-node)

## Architecture

Users self-register monitors through an HTTP API; registering starts an immediate Step Functions execution for that user. An EventBridge schedule then triggers a dispatcher every twelve hours that lists every registered monitor and starts one isolated execution per user. Both paths start the same state machine. Within an execution, the unit of work is a single `(userId, releaseId)`, not the whole wantlist, so execution scales linearly and never times out.

```
                 POST /monitors                    DELETE /monitors/{username}
                       │                                       │
                       ▼                                       ▼
              ┌──────────────────── registerMonitor Lambda ───────────────────┐
              │  validate + upsert Monitor (PK MONITOR  SK MONITOR#<username>) │
              │  + send confirmation email & start an immediate first run      │
              └───────────────────────────────┬───────────────────────────────┘
                                               ▼
                              DynamoDB (Monitors) + StartExecution
                                  (immediate first run on the same
                                   state machine the schedule uses, below)

EventBridge (rate: 12h)
        │
        ▼
┌──────────────────────── dispatchMonitors Lambda ───────────────────────┐
│  list all Monitors ──► StartExecution per enabled user                  │
│  input: { username, shipsFrom, destinationEmail, discogsToken? }        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                 ▼  (one execution per user)
┌─────────────────────────────────────────────────────────────┐
│ Step Functions state machine                                 │
│                                                              │
│  GetWantlist ──► Map (DISTRIBUTED, MaxConcurrency 2) ──► SendDigest
│  (one task         │  CheckReleaseMarketplace                │
│   per release;     │  · scrape sell page for listing ids     │
│   uses user's      │  · fetch only NEW ids via Discogs API   │
│   token)           │  · filter shipsFrom                      │
│                    │  · record new matches (un-notified)     │
│                    │  Retry: exponential backoff per release │
└─────────────────────────────────────────────────────────────┘
        │                                       │
        ▼                                       ▼
  DynamoDB (single table)              Resend (one digest email
  · Monitor                             of un-notified listings,
    PK MONITOR SK MONITOR#<username>    then marks them notified)
  · ReleaseCheckState
    PK USER#<id> SK RELEASE#<id>
  · MarketplaceListingState
    PK USER#<id> SK LISTING#<id>
```

Key properties:

- **Multi-tenant** — users sign up via `POST /monitors`; the scheduled `dispatchMonitors` Lambda fans one Step Functions execution out per registered user, so one user's failure or rate-limit never affects another.
- **Rate-limit safe** — low Map concurrency plus a fixed throttle and jittered exponential backoff on Discogs `429`s; failures are isolated per release so one bad release never fails the run.
- **Incremental** — `ReleaseCheckState` skips releases checked within the last hour and tracks seen listing ids, so each run only fetches genuinely new listings.
- **Idempotent** — new listings are written to `MarketplaceListingState` with a conditional put; `SendDigest` emails un-notified rows then marks them notified, so retries never duplicate or drop a digest.
- **One digest per run** — a single formatted HTML email (with plain-text fallback) per run, containing only newly-seen listings.

The DynamoDB table is provisioned in [/infrastructure](./infrastructure) via the shared `dynamodb-single-table` module; the Lambdas and state machine are deployed with the Serverless Framework.

## Digest email

Each run sends one formatted HTML digest (subject `Discogs Wantlist Digest for <username> shipping from <countries>`) with a card per newly-seen listing: cover thumbnail, artist – title linked to the Discogs release, price + shipping, condition/sleeve/format/year/ships-from/posted details, the seller's comments, and a **View listing** button. A plain-text version is included for clients that don't render HTML. All marketplace-sourced text is HTML-escaped and URLs are validated before rendering ([src/digestEmailTemplate.ts](./src/digestEmailTemplate.ts)).

Plain-text version of a digest entry:

```
Blakroc - Blakroc
A$649.99 + shipping TBC
Condition: Mint (M) | Sleeve: Mint (M) | Format: LP, Album + CD, Album | Year: 2009
Factory Sealed. Australian seller. Indie Record Store
https://www.discogs.com/sell/item/…
```

## Prerequisites

You must [sign up for/create a Discogs app](https://www.discogs.com/settings/developers) to obtain the Discogs authentication variables required below. You must [create a Resend account](https://resend.com/) to obtain the Resend authentication variable required below.

## Running locally

### Environment variables

- **DISCOGS_CONSUMER_KEY/DISCOGS_CONSUMER_SECRET** OR **DISCOGS_USER_TOKEN** (req - see [Discogs API documentation](http://www.discogs.com/developers/#page:authentication) for more info) - Auth for Discogs app
- **RESEND_API_KEY** (req) - Auth for Resend account
- **SENDER_EMAIL** (req) - Email address to send digest from via Resend (domain must be verified in Resend)
- **DYNAMODB_TABLE** (opt) - Single-table name for state. Set automatically when deployed; when unset (e.g. local dev) state is skipped and every release is re-checked
- **DISCOGS_THROTTLE_MS** (opt, default `1100`) - Fixed delay between external Discogs calls
- **RECENTLY_CHECKED_MS** (opt, default `3600000`) - Releases checked more recently than this are skipped
- **STATE_TTL_MS** / **LISTING_TTL_MS** (opt, default 30 days) - TTL for `ReleaseCheckState` / `MarketplaceListingState` rows
- **SCRAPER_REQUEST_TIMEOUT_MS** (opt, default `25000`) - Hard per-request timeout for sell-page scrapes
- **SCRAPER_MAX_ATTEMPTS** (opt, default `4`) - In-process scrape attempts per release (bounded 1-6; trimmed automatically if the combination with the timeout would exceed the Lambda budget)
- **SCRAPER_CIRCUIT_FAILURE_THRESHOLD** (opt, default `3`) - Consecutive exhausted scrape failures before the warm-container circuit breaker opens
- **SCRAPER_CIRCUIT_OPEN_MS** (opt, default `120000`) - How long an open circuit fails fast without calling Discogs
- **SCRAPER_PROFILES** (opt, default `safari_16_0,firefox_117`) - Comma-separated browser TLS profiles; unknown names are ignored with a warning (see `src/scraperConfig.ts`)
- **DEBUG** (opt) - If true, enables debug logging to console

All `SCRAPER_*` values are validated at startup ([src/scraperConfig.ts](./src/scraperConfig.ts)): zero/negative/NaN/absurd values fall back to safe defaults or are clamped, so misconfiguration can never produce a zero-timeout or an unbounded retry loop.

  **All required environment variables above must be set before `pnpm run dev` command. These can also be set via a .env file.**

E.g. `DISCOGS_USER_TOKEN=YOUR_USER_TOKEN RESEND_API_KEY=YOUR_API_KEY SENDER_EMAIL=you@yourdomain.com pnpm run dev --path test.json`

### Event variables

In production the scheduled `dispatchMonitors` Lambda builds the workflow input per registered monitor; locally the `test.json` payload is passed straight to the `GetWantlist` Lambda that starts the workflow - see the [MarketMonitorEvent interface](/src/interfaces.ts) for definition.

#### Example MarketMonitorEvent file/object

An example event file is included in the [test.json](./test.json) file. This should be modified as needed for testing.

```
{
  "username": "YOUR_DISCOGS_USERNAME",
  "shipsFrom": "Australia, New Zealand",
  "destinationEmail": "you@internet.com"
}
```

Once the [test.json](./test.json) file has been configured, use the following commands to install and run the monitor.

```
pnpm install
pnpm run dev --path test.json
```

## Resilience & operations

Discogs **retired the marketplace RSS endpoint** (`/sell/mplistrss`) in June 2026 — it returns a Discogs-branded 403 to every client and must not be restored. Listing discovery now scrapes the public sell page (`/sell/release/{id}`) through [node-tls-client](https://github.com/Sahil1337/node-tls-client), which impersonates a real browser TLS handshake to pass Cloudflare bot management. This is **best-effort by nature**: Discogs/Cloudflare changes can degrade it at any time, so the system is built to degrade per-release, not per-run:

- **One bad release costs one release.** Each release is checked in its own Distributed Map item. Cloudflare blocks rotate the scraper session (fresh cookies + TLS fingerprint) and retry with bounded, jittered backoff; if a release still fails, only that Map item fails. The Map tolerates up to 25% item failures (`ToleratedFailurePercentage`), so `SendDigest` still runs and emails everything that succeeded — it reads the un-notified DynamoDB ledger, never Map output.
- **Failed scrapes are never recorded as "no listings".** `ReleaseCheckState` is only written after the sell page was actually fetched and parsed (a genuine zero-listing page is verified by sell-page markers before an empty result is trusted). Failed releases keep their old state and are retried by Step Functions now and by the next scheduled run.
- **A poisoned warm container stops hammering Discogs.** After 3 consecutive releases exhaust their scrape attempts, a module-local circuit breaker opens for 2 minutes and fails fast (typed `circuit_open`, no network calls), letting Step Functions retry later — often on a different container.
- **Failed digest emails never mark listings notified.** The Resend SDK returns `{ data, error }` without throwing; an `error` is converted to a thrown `EmailSendError`, the `SendDigest` Lambda fails and Step Functions retries. Listings are marked notified strictly after a confirmed send, so the failure mode is a duplicated digest, never a lost listing.

### Diagnosing incidents in CloudWatch

Scraper and workflow steps emit one-line structured JSON logs. Search by `event`:

`scraper_request_start`, `scraper_request_success`, `scraper_retry_scheduled`, `scraper_session_rotated`, `scraper_challenge_detected`, `scraper_request_timeout`, `scraper_attempt_failed`, `scraper_attempts_exhausted`, `scraper_circuit_opened`, `scraper_config_invalid`, `release_check_started`, `release_check_recently_checked_skip`, `release_check_success`, `release_check_failed`, `digest_send_attempted`, `digest_send_failed`, `digest_send_succeeded`, `digest_mark_notified_started`, `digest_mark_notified_succeeded`

Failures carry a typed `errorType` (`blocked` | `timeout` | `transport` | `server_error` | `rate_limited` | `challenge` | `parse_error` | `circuit_open` | `unexpected`) plus attempt counts, HTTP status, profile and duration. Logs never include tokens, cookies, headers, HTML bodies or email addresses.

### Packaging note (node-tls-client / koffi)

`node-tls-client` loads a native helper via `koffi` and downloads a platform shared library into `/tmp` on first use (the Lambdas are not in a VPC, so they have the required internet egress). Neither can be esbuild-bundled: `serverless.yml` keeps them in `build.esbuild.external` so they ship as real `node_modules`. After any dependency or packaging change, run `pnpm run verify:package` — it packages the service and asserts the koffi Linux x64 binary, node-tls-client and its cookie dependencies are in the artifact and that the generated state machine keeps its tolerated-failure and retry config.

## Testing

```bash
pnpm run test        # vitest unit tests (scraper, retry, circuit breaker, state, email)
pnpm run typecheck   # tsc --noEmit
pnpm run lint        # tslint
pnpm run verify:package  # packages and inspects the artifact + generated ASL
```

## Deployment/Infrastructure

The Terraform in [/infrastructure](./infrastructure) provisions the CI/CD pipeline (CodeBuild project + webhook + IAM role), the DynamoDB single table, and the SSM parameters the app reads — all composed from the shared [`terraform-modules`](https://github.com/jch254/terraform-modules) (`codebuild-project`, `codebuild-terraform-role`, `dynamodb-single-table`, `ssm-parameter-placeholder`). The Lambdas and Step Functions state machine are deployed with the Serverless Framework (`pnpm run deploy`).

Day-to-day, pushing to `master` triggers CodeBuild, which runs [buildspec.yml](./buildspec.yml): `terraform apply` (infra) then `pnpm run deploy` (app). The pipeline is self-managing because the CodeBuild project that runs it is itself defined in this Terraform — so the **very first** deploy has to be bootstrapped by hand (see below).

The SSM parameters are created as placeholders by Terraform; set their real values out-of-band (console/CLI) before the first scheduled run — Terraform won't overwrite them on later applies:

- `/discogs-market-monitor/discogs_user_token` (SecureString)
- `/discogs-market-monitor/resend_api_key` (SecureString)
- `/discogs-market-monitor/sender_email`
- `/discogs-market-monitor/username`
- `/discogs-market-monitor/ships_from`
- `/discogs-market-monitor/destination_email`

### First deploy (bootstrap)

The CI pipeline can't deploy itself the first time, so run these once locally with AWS credentials for the target account:

**Prerequisites (exist outside this repo):**

- Terraform remote-state S3 bucket (`jch254-terraform-remote-state`)
- A GitHub source credential imported into CodeBuild (`aws codebuild import-source-credentials`) so the webhook can register
- A Resend account with a verified sender domain

**Steps:**

1. **Infra** — from [/infrastructure](./infrastructure):

   ```bash
   terraform init \
     -backend-config 'bucket=jch254-terraform-remote-state' \
     -backend-config 'key=discogs-market-monitor' \
     -backend-config 'region=ap-southeast-2'
   terraform apply
   ```

   This creates the CodeBuild project + webhook + IAM role, the DynamoDB table, and the placeholder SSM parameters.

2. **Set the SSM parameter values** (the six listed above) via console/CLI.

3. **App** — from the repo root:

   ```bash
   pnpm install
   pnpm run deploy
   ```

   Note the `httpApi` endpoint in the deploy output — it's the API host used for signups and the frontend's `PUBLIC_API_BASE_URL`.

After this, every push to `master` redeploys automatically via CodeBuild. The signup UI is a separate stack — see [/frontend/infrastructure](./frontend/infrastructure).

The first scheduled run starts with empty state, so it behaves like a full scan (every current matching listing is "new" and included in one digest). Subsequent runs only surface newly-seen listings.
