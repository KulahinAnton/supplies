import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    // Some lib modules import the Prisma singleton at module scope; load .env
    // the same way prisma.config.ts does. Tests never open a connection.
    setupFiles: ["dotenv/config"],
  },
});
