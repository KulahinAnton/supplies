import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // No setupFiles: these tests are given their environment as an argument
    // rather than reading one. `validateEnv` taking a plain object instead of
    // touching `process.env` is what makes that possible.
  },
});
