import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    // Two homes, for two different reasons:
    //
    // - `packages/**` is the engine and the data layer. Core's tests moved with
    //   the code they cover and import it relatively, so they run identically
    //   from the API, the SPA or a mobile checkout. `packages/db` holds the
    //   tests that genuinely need Prisma — including the two drift guards
    //   (`prisma-decimal`, `prisma-units`) that compare the engine's own types
    //   against the generated client's, which is a comparison core itself is
    //   forbidden to make.
    // - `bot/**` because Feature 30.1 put the reply keyboard's labels under
    //   test, and they live with the views that use them. `bot/digest.test.ts`
    //   moved here with `digest.ts` when the bot became `@supplies/bot`.
    //
    // `apps/**` is absent on purpose: each app runs its own suite through
    // `pnpm -r --filter`, because they need different environments (the API
    // needs one with a database, the SPA a DOM).
    include: ["packages/**/*.test.ts", "bot/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "packages/db/src/generated/**"],
    // Some modules import the Prisma singleton at module scope; load .env the
    // same way prisma.config.ts does. Tests never open a connection.
    setupFiles: ["dotenv/config"],
  },
});
