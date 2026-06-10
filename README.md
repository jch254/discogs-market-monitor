# [Discogs Wantlist Marketplace Monitor](https://discogs.603.nz)

![Build Status](https://codebuild.ap-southeast-2.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiUDhXeDRQQlY5UXRDRDY1RHVDSm5sK1d6TEp0UDR0QTl3QXE4V0NoZkZKZFZ6SVp3WUJBSFVtdW9iMm5CQlVzbVl5b2hHZi8zUEptZGMzdmo3b0JOcHlZPSIsIml2UGFyYW1ldGVyU3BlYyI6Inh5aTgyT0NBa2VnVmxtVFkiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=master)

Discogs Wantlist Marketplace Monitor powered by Serverless, Step Functions, TypeScript and Node.js. The monitor scans the Discogs Marketplace for listings from the specified user's wantlist in the specified countries and sends a digest email of all matching listings to the specified email address. It runs as an AWS Step Functions workflow — immediately when you sign up, then on a schedule every twelve hours via EventBridge. This saves manually searching through your wantlist for local listings.

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
│                    │  Retry: 429 → exponential backoff       │
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
- **Unchanged UX** — still one aggregated digest email per run (now containing only newly-seen listings).

The DynamoDB table is provisioned in [/infrastructure](./infrastructure) via the shared `dynamodb-single-table` module; the Lambdas and state machine are deployed with the Serverless Framework.

## Example email digest

<details>
  <summary>
    Example digest email shipping from Australia and New Zealand (currently JSON dump)
  </summary>

```
[
  {
    "artist": "Blakroc",
    "title": "Blakroc",
    "price": "A$649.99",
    "shippingPrice": "TBC",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW9gN8-2B5jB5gVtnTIZormXxBzn6ZIJfiHvf0SpqcoRd4ww-3D-3Difwg_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEynwO6wb4WwHWkUoitt1szutnb8omBzLuYFKS-2Fs-2Fcm5oydfpJr6Y7BGD8cYWlHviBBuEf1dolsTZOboHVoy9HI0cZgxNkZEbCIS4-2FlW8t-2FDWg72Hr0wcLgEEg8v9toeNsfUSulg1onleyaKzN2y-2BTfQ-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Mint (M)",
    "comments": "Factory Sealed. Australian seller. Indie Record Store",
    "posted": "2023-06-25T20:16:11-07:00",
    "description": "Blakroc - Blakroc (LP, Album + CD, Album)",
    "format": "LP, Album + CD, Album",
    "year": 2009,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Black Milk",
    "title": "If There's A Hell Below",
    "price": "A$200.00",
    "shippingPrice": "80 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2FxnMPsxpSKeCZFDcJ-2BomHe7t3lwhdZZx5O2XPiKn-2BaVw-3D-3DlBej_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEp406EX-2F1jgXmbI1l4ePHWHu1W1MNwyiF7iuxrg2Hjk5xJRS3WbuXDm9Kcp4MVzaPwkroC8Cp9oYSy6SAA-2FWHhV-2BPQTro9w-2BiNS4-2BsCzKjycokzzN7l0SAyi9Y1L-2BNNInxXDdiAzOFP0AUjr6-2BmylMw-3D-3D
    "condition": "Near Mint (NM or M-)",
    "sleeveCondition": "Very Good Plus (VG+)",
    "comments": "SIGNED BY BLACK MILK on red sleeve. Sleeve is very close to NM but has a squashed corner. Vinyl unplayed.",
    "posted": "2022-08-05T14:52:25-07:00",
    "description": "Black Milk - If There's A Hell Below (2xLP, Album)",
    "format": "2xLP, Album",
    "year": 2014,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Ólafur Arnalds & Nils Frahm",
    "title": "Loon",
    "price": "A$39.00",
    "shippingPrice": "45 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2F5JXMLZKto6fmbICxfExF9yt47oNKDU1XCwT1q2bshkA-3D-3DnA_k_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEc0exYICTphZMkKaJlgfh720n-2FfXI8PguzeOgz38fgcNSJHFifwzN9Cd-2BP-2ByJFjnuUMmOWzTkT6rE6OOwhkNnPqHiOw3Z6v4ZzigXpMYKeiwCVmNXINVpAUiCqnEU-2FEKR1xkY-2B80HaS3plaFO-2BlV-2BwA-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Mint (M)",
    "comments": "New, Factory Sealed! ----- contact for full stocklist and deals ---- Free Pickup in Brisbane",
    "posted": "2024-03-31T18:31:02-07:00",
    "description": "Ólafur Arnalds & Nils Frahm - Loon (12\", EP)",
    "format": "12\", EP",
    "year": 2015,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Curren$y, Freddie Gibbs, Alchemist",
    "title": "Fetti ",
    "price": "NZ$450.00",
    "shippingPrice": "TBC",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2F0WWoR4f38bZIqkg04OvxslLaUIVj85eWSl1uSRi1g7Q-3D-3Di9Kc_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEP2kiIVvWb1I0fkMlzzR7sIbkpTC5Nxfix-2FXmeONYR7ZYxR55UJdePOoToDcVUphk1lMuF3Es17UKQhVeeBoJW4sJ939WuEkjKkiygQ9hEesFscOTPmBeEtLpZsi9MAfzq85ZqALc-2FtWukwIHuIqf5w-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Very Good (VG)",
    "comments": "Unplayed. Creased corner (arrived like that). Signed by Freddie Gibbs!",
    "posted": "2023-10-02T17:20:51-07:00",
    "description": "Curren$y, Freddie Gibbs, Alchemist - Fetti  (LP, Album, RSD, Ltd, Yel)",
    "format": "LP, Album, RSD, Ltd, Yel",
    "year": 2019,
    "shipsFrom": "New Zealand"
  },
  {
    "artist": "Pusha T",
    "title": "King Push – Darkest Before Dawn: The Prelude",
    "price": "A$95.00",
    "shippingPrice": "40 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2B16OLv1ONswP6Wod1IFGoZZy4V9u0gHwI21AgMRpL1YA-3D-3DFhs5_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgE4jiEUKR-2FHB4K6EFgwG6fgESLQV5nZLWnHwXxPVboy1p4NBYtCZ8CxxODWxCfoCLsNeY-2F9M-2BfWgZxf3OPkDYQJGDeSW16HvEOe0u4VGosCTYXpB5ZyIh-2BIjW-2FFvDqKn9NIUATRaR1ylAxpmMP1SaqJA-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Mint (M)",
    "comments": "Mint and sealed",
    "posted": "2023-10-19T01:30:09-07:00",
    "description": "Pusha T - King Push – Darkest Before Dawn: The Prelude (LP, Album)",
    "format": "LP, Album",
    "year": 2016,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Pusha T",
    "title": "King Push – Darkest Before Dawn: The Prelude",
    "price": "A$96.00",
    "shippingPrice": "30 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW95fQ-2Boo347Z2Gq-2FL-2FfY7fgHNav9vkiSYCbU7FT6UT2oQ-3D-3DFgj8_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEkjZ4I6tbAGNHHQermbO8FYG7YuGHd5Gzm7jY49vJoZT7qYUVlRBdlSpy-2B0NnEMy8PPmY9iKMdTrXPviMpW8r1BA7JFiGVu8pV7oXCoeWlexeGScmq1ETfKfEYtFuajkjzOxdgamyYEGQJ4GRWe59zQ-3D-3D
    "condition": "Near Mint (NM or M-)",
    "sleeveCondition": "Very Good Plus (VG+)",
    "comments": "INCLUDING INSERT. www.shoesonawire.com",
    "posted": "2024-03-06T18:19:15-08:00",
    "description": "Pusha T - King Push – Darkest Before Dawn: The Prelude (LP, Album)",
    "format": "LP, Album",
    "year": 2016,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Allah-Las",
    "title": "Allah-Las",
    "price": "A$110.00",
    "shippingPrice": "40 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2BMYg3yHkhNtD4QsU-2FhD1DhUXVi1yxqUIjIFObcjSjVbQ-3D-3DrT9e_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEApduvM9ztb3SDN1a3pdf48NJ7IaWOW8LDuO6S4xVwCbbHUNiTgP0pr-2FLDi0SvU-2FFDIyYLwSstB8Z9PoYeFTnYmI7g-2FLkk1CEJW3hfkukTRcgzfN2w47-2FpDUab-2FCxJUgisj41QL2-2BmLL1GLofKqnEvQ-3D-3D
    "condition": "Very Good Plus (VG+)",
    "sleeveCondition": "Very Good Plus (VG+)",
    "comments": "Sleeve close to NM but has tiny corner dents on the right side. Vinyl in good condition, nothing of note. HD images available on request",
    "posted": "2023-12-18T20:57:26-08:00",
    "description": "Allah-Las - Allah-Las (LP, Album)",
    "format": "LP, Album",
    "year": 2012,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Allah-Las",
    "title": "Allah-Las",
    "price": "A$99.00",
    "shippingPrice": "TBC",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2F6npaqamQ8Z-2B97i6A1GLTUdMN2fw6wpuhUgkmQ0zhc8g-3D-3DW3v4_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEGtDysoZOvXxZnCbnZ11q9rO8I89fIwrKpucPv8coyW-2FLR42lR2Tyvc9jOawZO72RtJgYZv4IIxTDByEcieawVFc4RCLWv33nWh15rKf5jmQINwD-2BoZ8mwFBBqtaGUV0RCn-2BX9ukR-2Brj-2BQKRl4VcRaw-3D-3D
    "condition": "Very Good Plus (VG+)",
    "sleeveCondition": "Very Good Plus (VG+)",
    "comments": "Minor scuff on record, doesn't affect play \nCover in VG+ condition with minor creasing with age ",
    "posted": "2024-02-12T16:03:28-08:00",
    "description": "Allah-Las - Allah-Las (LP, Album)",
    "format": "LP, Album",
    "year": 2012,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Fly My Pretties",
    "title": "The Studio Recordings Part 2",
    "price": "NZ$49.00",
    "shippingPrice": "70 NZD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2F-2BJahGTzDH2v-2Bm0dwk4QIek5q4hDCy8fsaXqZ8dq7AcA-3D-3DxtiU_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEhW22US-2FBsBzz3oBg8yXAmsnf6pxNxw95UgHB1sTdtjLSMK2PNyDLW7ghV-2FRD6KS511m-2FyTdkpyw8-2B8ztfR-2FJQzXnD2sQ30U3MHlZBYUM-2BpQyn7vjXPrjd3Xx7RIOFHRS2Yx9dgpcwf-2Blyy3qahdlJA-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Mint (M)",
    "comments": "Fly My Pretties ‎– The Studio Recordings Par 2",
    "posted": "2022-11-20T19:55:27-08:00",
    "description": "Fly My Pretties - The Studio Recordings Part 2 (LP, Album)",
    "format": "LP, Album",
    "year": 2020,
    "shipsFrom": "New Zealand"
  },
  {
    "artist": "Real Bad Man",
    "title": "On High Alert Volume 1",
    "price": "A$56.16",
    "shippingPrice": "26 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2B7bwAsQpark6sm7uavk5UFLrFk-2FhqH18U-2BzFJpA-2FXRdw-3D-3D5rFJ_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEwtzGH-2BE70UCzqpL-2F2BFXvO6O1BCE5-2BU-2F6zEON-2BOhAWC-2BFfTr80CZDj6Bwp9f73lOFtAsYEaiX6HbivyzoKVd4Lt-2FaaUN3JwVmIwKfSlppwYKNNq634y8UqJ7yLLf6KnBIoC9C3rJ9gG-2BovHDXnA4Cw-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Mint (M)",
    "comments": "",
    "posted": "2022-10-30T05:59:14-07:00",
    "description": "Real Bad Man - On High Alert Volume 1 (12\", MiniAlbum)",
    "format": "12\", MiniAlbum",
    "year": 2020,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Jay-Z",
    "title": "Kingdom Come",
    "price": "A$165.00",
    "shippingPrice": "49 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW9ITPZONt5lGCqbPOovYQ8d5J6OndH9PO1lZ9RSsrnQBw-3D-3DW2cL_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEF4tzXwTMtJ0iIj6oIyw3AYk5CgTMjj6vYfg0d6D5VcdDUAc7ZSqCBZOKsVF5MbtFtvEbT3KgOa7LLsRzubj4pg8svou1v2rRECPTtplMGMVXg-2FGf-2BaVKYj0EDOoTaJqpJInxoAjI3wyAyISNhbhQAA-3D-3D
    "condition": "Near Mint (NM or M-)",
    "sleeveCondition": "Near Mint (NM or M-)",
    "comments": "OG US. SLEEVE IN SHRINK WITH HYPE STICKER. RECORDS VG++ TO NM. INCLUDING INSERT. www.shoesonawire.com",
    "posted": "2024-03-04T17:57:49-08:00",
    "description": "Jay-Z - Kingdom Come (2xLP, Album)",
    "format": "2xLP, Album",
    "year": 2006,
    "shipsFrom": "Australia"
  },
  {
    "artist": "Ghostface Killah And Adrian Younge",
    "title": "Twelve Reasons To Die ",
    "price": "NZ$48.00",
    "shippingPrice": "45 NZD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW81EOaKfEYbo2KieD1Z5zoG4hT07MqjsZGtThthUECBRQ-3D-3Detcr_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgE5VWR6EQlHKqk1w-2FQhfCi6FokzR0xptj4CqeSlld3L0Yr9Vu1pmsDy-2FfQ-2Fi3J38EvhTMzvojUGjwDk-2F0Z8sr-2ByvZ2O2S5wsIMqMYwyvQoW6bLuVr0WBChj2zzWKwV62AjWLaDW-2BJGg7A31aq4BthXpQ-3D-3D
    "condition": "Near Mint (NM or M-)",
    "sleeveCondition": "Near Mint (NM or M-)",
    "comments": "Played Once, Unsealed, Don't Send Payment Immediately As Shipping Price May Vary ",
    "posted": "2024-04-02T15:11:45-07:00",
    "description": "Ghostface Killah And Adrian Younge - Twelve Reasons To Die  (LP, Album)",
    "format": "LP, Album",
    "year": 2013,
    "shipsFrom": "New Zealand"
  },
  {
    "artist": "Jay-Z / Linkin Park",
    "title": "Collision Course",
    "price": "A$350.00",
    "shippingPrice": "60 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW-2BkXcSSg6l8v7T-2BLv87h8XE83OAYw3a2kCJ-2FWkSPlKAzQ-3D-3DYcko_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgEv8fIc-2BPxPtAvSbkaDKe9nKzb8sdHUkV1LWU-2BMJlhOFddNiowrQ-2B7auQ4Z-2F38lcT-2FRoeUpqzGRlTWSswqZr-2FBijgTOZZtO-2BFe-2FH6pDwyxwJBA33ViwBrSnTE0U7oGWMM9joP6mL0z-2ByjzZ7vcBQg3Og-3D-3D
    "condition": "Near Mint (NM or M-)",
    "sleeveCondition": "Near Mint (NM or M-)",
    "comments": "Great condition, played handful of times. No warping or skipping. Doesn't include DVD",
    "posted": "2024-04-01T02:27:53-07:00",
    "description": "Jay-Z / Linkin Park - Collision Course (LP, RSD, Ltd, RE, Blu + DVD-V)",
    "format": "LP, RSD, Ltd, RE, Blu + DVD-V",
    "year": 2014,
    "shipsFrom": "Australia"
  },
  {
    "artist": "The Weeknd",
    "title": "Echoes Of Silence",
    "price": "A$95.00",
    "shippingPrice": "45 AUD",
    "uri": "https://u35859020.ct.sendgrid.net/ls/click?upn=u001.lvL4tmoKtmcA3LJ3Cg74yZWpvIK9lCtG2FzwPM-2BF-2FW8XoXz-2FtMkrKTgAJk1lojZcjW9ah-2B9jefU186zr0AfEKQ-3D-3DN1Vi_eOMbwaONHyCvJAMzKRRFMhlXGhtFqZmHO01LCioUu8blGwzule0NbLZGXuu4r-2FgETjN0JnvbI8-2Bt-2Fhsd5rqiWNIQ5y-2FEN273z6RdaNyfimowByCoolrrJEUc6COnhdJa9WYuXpu2R8AKe2FIm97sXeCK-2BgroBTeTz0pd1FlVBoPUXFFt11SWpYfkACR6ipXHZWArfShQQo957UsPwJIFHA-3D-3D
    "condition": "Mint (M)",
    "sleeveCondition": "Mint (M)",
    "comments": "New, Factory Sealed! ----- contact for full stocklist and deals ---- Free Pickup in Brisbane",
    "posted": "2024-03-31T18:31:02-07:00",
    "description": "The Weeknd - Echoes Of Silence (2xLP, Mixtape, RE)",
    "format": "2xLP, Mixtape, RE",
    "year": 2015,
    "shipsFrom": "Australia"
  }
]
```

</details>

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

Discogs Wantlist Marketplace Monitor is designed to be run on a schedule. The EventBridge schedule input (or the `test.json` payload locally) is passed to the `GetWantlist` Lambda that starts the workflow - see the [MarketMonitorEvent interface](/src/interfaces.ts) for definition.

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

- **One bad release costs one release.** Each release is checked in its own Distributed Map item. Cloudflare blocks rotate the scraper session (fresh cookies + TLS fingerprint) and retry with bounded, jittered backoff; if a release still fails, only that Map item fails. The Map tolerates up to 15% item failures (`ToleratedFailurePercentage`), so `SendDigest` still runs and emails everything that succeeded — it reads the un-notified DynamoDB ledger, never Map output.
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
