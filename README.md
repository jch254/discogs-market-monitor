# [Discogs Wantlist Marketplace Monitor](https://603.nz)

![Build Status](https://codebuild.ap-southeast-2.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiUDhXeDRQQlY5UXRDRDY1RHVDSm5sK1d6TEp0UDR0QTl3QXE4V0NoZkZKZFZ6SVp3WUJBSFVtdW9iMm5CQlVzbVl5b2hHZi8zUEptZGMzdmo3b0JOcHlZPSIsIml2UGFyYW1ldGVyU3BlYyI6Inh5aTgyT0NBa2VnVmxtVFkiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=master)

Discogs Wantlist Marketplace Monitor powered by Serverless, TypeScript, Webpack and Node.js. The monitor scans the Discogs Marketplace for listings from the specified user's wantlist in the specified country and sends a digest email of all matching listings to the specified email address. It runs as an AWS Lambda function (scheduled every twelve hours). This saves manually searching through your wantlist for local listings.

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
* **SHIPS_FROM** (req) - Country where Marketplace listings should ship from (e.g. Australia or United States - case insensitive)
* **DESTINATION_EMAIL** (req) - Destination email address to send digest
* **SENDER_EMAIL** (req) - Email address to send digest from via SendGrid (must be configured via SendGrid)
* **DEBUG** (opt) - If true, enables debug logging to console

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
