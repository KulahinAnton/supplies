import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    // Three homes, for three different reasons:
    //
    // - `packages/core/**` is the engine. Those tests moved with the code they
    //   cover and import it relatively, so they run identically from the API,
    //   the SPA or a mobile checkout.
    // - `lib/**` is what is left behind: the drift guards that deliberately
    //   compare core against Prisma (`decimal`, `units`), and the modules that
    //   genuinely need a database client.
    // - `bot/**` because Feature 30.1 put the reply keyboard's labels under
    //   test, and they live with the views that use them.
    include: [
      "packages/core/src/**/*.test.ts",
      "lib/**/*.test.ts",
      "bot/**/*.test.ts",
    ],
    // Some lib modules import the Prisma singleton at module scope; load .env
    // the same way prisma.config.ts does. Tests never open a connection.
    setupFiles: ["dotenv/config"],
  },
});
