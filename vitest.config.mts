import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    // bot/ too: Feature 30.1 put the reply keyboard's labels under test, and
    // they live with the views that use them rather than in lib/.
    include: ["lib/**/*.test.ts", "bot/**/*.test.ts"],
    // Some lib modules import the Prisma singleton at module scope; load .env
    // the same way prisma.config.ts does. Tests never open a connection.
    setupFiles: ["dotenv/config"],
  },
});
