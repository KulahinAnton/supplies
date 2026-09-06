import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

/**
 * The repo-root `.env`, loaded before Next reads `process.env`.
 *
 * Next only looks for env files in its own project directory, which used to be
 * the repo root and is now `apps/web`. Everything else that needs
 * `DATABASE_URL` — the Prisma CLI, the bot, the scripts, the API's
 * `env-first.ts` — reads the root file, and duplicating it here would create
 * exactly the situation where the app and the migrations point at different
 * databases and nothing says so.
 *
 * `override: false` is the important flag: a real environment variable, which
 * is how Vercel supplies all of these in production, always wins over the file.
 * Locally the file wins over nothing and fills the gaps.
 */
loadEnv({
  path: [".env.local", ".env"].map((file) =>
    path.join(import.meta.dirname, "..", "..", file),
  ),
  override: false,
  quiet: true,
});

const nextConfig: NextConfig = {
  /**
   * The workspace packages ship TypeScript source rather than a built `dist`,
   * which is what lets Next, Vite and Metro all consume the same files with no
   * build step in between and no chance of a stale artefact. The cost is this
   * line: Next has to be told to compile them like first-party code.
   */
  transpilePackages: ["@supplies/core", "@supplies/db", "@supplies/bot"],
};

export default nextConfig;
