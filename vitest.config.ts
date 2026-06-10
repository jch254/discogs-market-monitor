import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Module-level state (scraper session/circuit) is reset via
    // vi.resetModules() in the tests themselves.
    restoreMocks: true,
  },
});
