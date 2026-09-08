import { defineConfig, devices } from "@playwright/test";

/**
 * SPA_API_PORT.md Phase 2.8 — the same bargain `apps/web` makes, against the
 * client that has no server.
 *
 * The pyramid underneath is already good: 357 unit tests over pure rules, 50
 * API checks against a live database. What neither can see is the browser —
 * and here the browser is doing more than it does in the Next app. There, a
 * form posts to a server action and the server re-renders. Here it fetches,
 * holds a token in memory, invalidates a query cache and re-renders itself.
 * That machinery is the seam these tests own.
 *
 * **Two servers, not one.** The Next suite starts a production build and is
 * done; this one needs the API as well, because an SPA with no API is a
 * spinner. `webServer` takes an array and Playwright waits for both.
 */
export default defineConfig({
  testDir: "./e2e",

  // Each spec signs in and mutates stock against one shared database, so they
  // must not interleave. Correctness over wall-clock.
  fullyParallel: false,
  workers: 1,

  // A test that only passes on the second try is a test that found something.
  retries: 0,
  forbidOnly: !!process.env.CI,

  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL: process.env.SPA_E2E_BASE_URL ?? "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      // The app is mobile-first and used standing in a shop. A layout that
      // only works at 1280px is not working.
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: [
    {
      /**
       * Port 3210, not the 3200 `pnpm api:dev` uses. A suite that silently
       * attached to a development server would prove nothing about the build,
       * and `reuseExistingServer: false` is the other half of that.
       *
       * CORS_ORIGINS has to name the preview origin below, or every request
       * fails as an opaque TypeError and the failure reads as "the API is
       * down" rather than "the API refused this origin".
       */
      command: "pnpm --filter @supplies/api start",
      url: "http://localhost:3210/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        API_PORT: "3210",
        CORS_ORIGINS: "http://localhost:4173",
      },
    },
    {
      /**
       * Built here rather than assumed, because `VITE_API_URL` is **inlined at
       * build time**. A bundle built for the default 3200 would ignore the API
       * this config just started on 3210 and fail as `ERR_CONNECTION_REFUSED`
       * — which reads as a broken app rather than a misconfigured suite.
       *
       * `--strictPort` so a busy 4173 fails loudly instead of serving the app
       * somewhere the tests will not look for it.
       */
      command:
        "pnpm --filter @supplies/spa exec vite build && pnpm --filter @supplies/spa exec vite preview --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: false,
      timeout: 180_000,
      env: { VITE_API_URL: "http://localhost:3210" },
    },
  ],
});
