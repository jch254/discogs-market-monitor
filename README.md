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

## Deployment/Infrastructure

Refer to the [/infrastructure](./infrastructure) directory.

## TODO

* Add deets/update env vars in README
* Fix rate limiting Discogs API error

  ```
  {
      "errorMessage": "Unknown error.",
      "errorType": "DiscogsError",
      "stackTrace": [
          "DiscogsError: Unknown error.",
          "    at IncomingMessage.passData (/Users/jch254/Dev/jch254/proj/discogs-market-monitor/node_modules/disconnect/lib/client.js:212:23)",
          "    at IncomingMessage.emit (node:events:532:35)",
          "    at IncomingMessage.emit (node:domain:475:12)",
          "    at endReadableNT (node:internal/streams/readable:1346:12)",
          "    at processTicksAndRejections (node:internal/process/task_queues:83:21)"
      ]
  }
  ```

* Format digest email instead of dumping JSON
* Deploy
* Fix OOM error?
