import { defineConfig, devices } from "@playwright/test";

/**
 * Feature 33 — end-to-end coverage for the paths no other test can reach.
 *
 * The existing pyramid is deliberate and good: ~340 unit tests over pure rules,
 * and a live-database smoke test for everything that needs Prisma. What neither
 * can see is the browser — that a form submits, that a server action reaches the
 * database, that the number on screen changes afterwards. These tests cover
 * exactly that seam and nothing else. They are not a place to re-assert FEFO;
 * `lib/stock.test.ts` already owns that and runs in milliseconds.
 *
 * **Runs against a production build**, not `pnpm dev`. Turbopack's first
 * compile of a route can take seconds and turns honest assertions into flaky
 * timeouts; and production is what the service worker and the real error
 * handling behave like.
 */
export default defineConfig({
  testDir: "./e2e",

  // Each spec signs in and mutates stock, so they must not interleave against
  // one shared database. Correctness over wall-clock here.
  fullyParallel: false,
  workers: 1,

  // A test that only passes on the second try is a test that found something.
  retries: 0,
  forbidOnly: !!process.env.CI,

  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    // Kept only for failures: a passing run should leave nothing behind.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // The app is mobile-first and used standing in a shop. A layout that
      // only works at 1280px is not working.
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],

  /**
   * Port 3100 on purpose: 3000 is where `pnpm dev` lives, and a test run that
   * silently attaches to a dev server is a test run that proves nothing about
   * the build. `reuseExistingServer` stays off for the same reason.
   *
   * AUTH_TRUST_HOST because this is a production build served on localhost,
   * which is the one case prisma/CLAUDE.md says it is legitimate for.
   */
  webServer: {
    command: "pnpm exec next start -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { AUTH_TRUST_HOST: "true" },
  },
});
