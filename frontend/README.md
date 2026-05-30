# Discogs Wantlist Marketplace Monitor — Frontend

A small, self-service signup UI for the
[Discogs Wantlist Marketplace Monitor](../README.md). Visitors register (or
update) their own monitor and can unsubscribe, all wired directly to the
deployed `httpApi` (`POST /monitors`, `DELETE /monitors/{username}`).

Built with [Astro](https://astro.build), [Tailwind CSS](https://tailwindcss.com)
and a small React island for the interactive form. The static output is hosted
on S3 and fronted by Cloudflare (see [infrastructure/](./infrastructure)).

## How it talks to the API

The API base URL is injected at build time via the `PUBLIC_API_BASE_URL`
environment variable and baked into the bundle. The form calls:

- `POST {PUBLIC_API_BASE_URL}/monitors` — register/update a monitor
- `DELETE {PUBLIC_API_BASE_URL}/monitors/{username}` — unsubscribe

`PUBLIC_API_BASE_URL` is the `httpApi` endpoint printed in the Serverless deploy
outputs (e.g. `https://abc123.execute-api.ap-southeast-2.amazonaws.com`).

## Running locally

```bash
cd frontend
pnpm install

# Point the build at your deployed (or local) API.
cp .env.example .env
# edit .env and set PUBLIC_API_BASE_URL

pnpm dev      # http://localhost:4321
```

Other scripts:

```bash
pnpm build    # static output to dist/
pnpm preview  # serve the built dist/ locally
```

## Deployment

CodeBuild builds this app and syncs `dist/` to the S3 site bucket on every push
to the source branch. The build reads `PUBLIC_API_BASE_URL` from the CodeBuild
project environment (set by Terraform). See
[infrastructure/README.md](./infrastructure/README.md) for the full setup.
