# [Discogs Wantlist Marketplace Monitor](https://603.nz)

![Build Status](https://codebuild.ap-southeast-2.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiUDhXeDRQQlY5UXRDRDY1RHVDSm5sK1d6TEp0UDR0QTl3QXE4V0NoZkZKZFZ6SVp3WUJBSFVtdW9iMm5CQlVzbVl5b2hHZi8zUEptZGMzdmo3b0JOcHlZPSIsIml2UGFyYW1ldGVyU3BlYyI6Inh5aTgyT0NBa2VnVmxtVFkiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=master)

Discogs Wantlist Marketplace Monitor powered by Serverless, TypeScript, Webpack and Node.js. The monitor scans the Discogs Marketplace for listings from the specified user's wantlist in the specified country and sends a digest email of all matching listings to the specified email address. It utilises AWS Step Functions and AWS Lambda Functions (scheduled every twelve hours). This saves manually searching through your wantlist for local listings.

## Technologies Used

* [Serverless](https://github.com/serverless/serverless)
* [TypeScript](https://github.com/microsoft/typescript)
* [Node.js](https://github.com/nodejs/node)
* [Webpack](https://github.com/webpack/webpack)
* [Serverless-webpack](https://github.com/elastic-coders/serverless-webpack)
* [Disconnect](https://github.com/bartve/disconnect)
* [@sendgrid/mail](https://github.com/sendgrid/sendgrid-nodejs/tree/main/packages/mail)

---

## Prerequisites

You must [sign up for/create a Discogs app](https://www.discogs.com/settings/developers) to obtain the Discogs authentication variables required below. You must [create a Sendgrid account](https://sendgrid.com/pricing/) to obtain the SendGrid authentication variable required below. I went with the SendGrid free tier.

## Running locally

### Environment variables

* **DISCOGS_CONSUMER_KEY/DISCOGS_CONSUMER_SECRET** OR **DISCOGS_USER_TOKEN** (req - see [Discogs API documentation](http://www.discogs.com/developers/#page:authentication) for more info) - Auth for Discogs app
* **SENDGRID_API_KEY** (req) - Auth for SendGrid account
* **DISCOGS_USERNAME** (req) - Username of Discogs user (wantlist will be used from this user)
* **SHIPS_FROM** (req) - Country where Marketplace listings should ship from (e.g. Australia - case insensitive)
* **DESTINATION_EMAIL** (req) - Destination email address to send digest
* **SENDER_EMAIL** (req) - Email address to send digest from via SendGrid (must be configured via SendGrid)
* **LOG_WANTLIST** (opt) - If true, user's wantlist will be logged to console

**All required environment variables above must be set before `yarn run dev` command. These can also be set via a .env file.**

E.g. `DISCOGS_USER_TOKEN=YOUR_USER_TOKEN SENDGRID_API_KEY=YOUR_API_KEY DISCOGS_USERNAME=YOUR_USERNAME SHIPS_FROM="New Zealand" DESTINATION_EMAIL=me@email.com SENDER_EMAIL=sendgrid@email.com yarn run dev`

```
yarn install
yarn run dev
```

## Testing

TBC

## Deployment/Infrastructure

Refer to the [/infrastructure](./infrastructure) directory.

## TODO

* Implement iteration of Lambda handler via Step Functions - [https://docs.aws.amazon.com/step-functions/latest/dg/tutorial-create-iterate-pattern-section.html](https://docs.aws.amazon.com/step-functions/latest/dg/tutorial-create-iterate-pattern-section.html)
* Make digest email pretty (add images and links etc.)
* Improve rate limiting error handling - add exponential backoff
* Add optional traversal of all variations of release (based on wantlist list item format e.g. vinyl - all vinyl variation)
* Add better handling for other Discogs errors (e.g. 502 response):

```
{
    "errorMessage": "Status code 502",
    "errorType": "Error",
    "stackTrace": [
        "Error: Status code 502",
        "    at ClientRequest.<anonymous> (/Users/jch254/Dev/jch254/proj/discogs-market-monitor/node_modules/rss-parser/lib/parser.js:88:25)",
        "    at Object.onceWrapper (node:events:640:26)",
        "    at ClientRequest.emit (node:events:520:28)",
        "    at ClientRequest.emit (node:domain:475:12)",
        "    at HTTPParser.parserOnIncomingClient (node:_http_client:618:27)",
        "    at HTTPParser.parserOnHeadersComplete (node:_http_common:128:17)",
        "    at TLSSocket.socketOnData (node:_http_client:482:22)",
        "    at TLSSocket.emit (node:events:520:28)",
        "    at TLSSocket.emit (node:domain:475:12)",
        "    at addChunk (node:internal/streams/readable:315:12)",
        "    at readableAddChunk (node:internal/streams/readable:289:9)",
        "    at TLSSocket.Readable.push (node:internal/streams/readable:228:10)",
        "    at TLSWrap.onStreamRead (node:internal/stream_base_commons:190:23)"
    ]
}
```
