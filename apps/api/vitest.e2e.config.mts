import { defineConfig } from "vitest/config";

/**
 * Separate from `vitest.config.mts` because these tests need a live seeded
 * database and the unit tests must not. Same split as `pnpm test` vs
 * `pnpm test:db` in the root package, and for the same reason: a fast suite
 * you can run on every save, and a slower one that proves the wiring.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.e2e.ts"],
    // One Nest app, one database. Parallel files would interleave writes
    // against the same demo household.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
