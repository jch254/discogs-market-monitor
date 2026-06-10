import { describe, expect, it } from 'vitest';

// Live smoke test against real Discogs - skipped unless LIVE_SMOKE=1.
//
//   LIVE_SMOKE=1 pnpm exec vitest run test/liveSmoke.test.ts
//
// Uses the production scraper module end-to-end (config, session, parse-check,
// retry). Keep the release list tiny and the run occasional: this hits Discogs
// for real.
describe.runIf(process.env.LIVE_SMOKE === '1')('live sell-page scrape', () => {
  it(
    'scrapes listing ids for known releases, including the once-poisoned 14756037',
    { timeout: 120000 },
    async () => {
      const { getReleaseListingIds } = await import('../src/marketplaceRss');

      // 14756037 = release that exhausted retries in the 2026-06 incident
      // (block was session-level, not release-level). 1067089 = small obscure
      // release.
      for (const releaseId of [14756037, 1067089]) {
        const ids = await getReleaseListingIds(releaseId);

        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);

        for (const id of ids) {
          expect(id).toMatch(/^\d+$/);
        }
      }
    },
  );

  it(
    'returns an empty array for a genuine zero-listing release',
    { timeout: 120000 },
    async () => {
      const { getReleaseListingIds } = await import('../src/marketplaceRss');

      // Verified live 2026-06-10: real sell page, zero items for sale.
      const ids = await getReleaseListingIds(31234567);

      expect(ids).toEqual([]);
    },
  );
});
