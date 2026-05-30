// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// Static SPA-style signup site. Deployed to S3 and fronted by Cloudflare (see
// infrastructure/). The API base URL is injected at build time via the
// PUBLIC_API_BASE_URL env var so the bundle can talk to the deployed httpApi.
export default defineConfig({
  site: process.env.SITE_URL || 'https://603.nz',
  integrations: [react(), tailwind()],
  output: 'static',
});
