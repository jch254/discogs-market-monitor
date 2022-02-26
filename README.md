# [Discogs Market Monitor](https://603.nz)

TBC

## Technologies Used

* [Serverless](https://github.com/serverless/serverless)
* [TypeScript](https://github.com/microsoft/typescript)
* [Node.js](https://github.com/nodejs/node)
* [Webpack](https://github.com/webpack/webpack)
* [Serverless-webpack](https://github.com/elastic-coders/serverless-webpack)
* [Disconnect](https://github.com/bartve/disconnect)
* [Docker](https://www.docker.com)

---

## Running locally

**DISCOGS_CONSUMER_KEY/DISCOGS_CONSUMER_SECRET OR DISCOGS_USER_TOKEN, DISCOGS_USERNAME environment variables must be set before `yarn run dev` command below. See [Discogs API documentation](http://www.discogs.com/developers/#page:authentication) for more info.**

E.g. `DISCOGS_USER_TOKEN=YOUR_USER_TOKEN DISCOGS_USERNAME=YOUR_USERNAME yarn run dev`

```
yarn install
yarn run dev
```

Script will execute locally

## Testing

TBC

### Deployment/Infrastructure

Refer to the [/infrastructure](./infrastructure) directory.
