import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `@supplies/core` ships TypeScript source rather than a built `dist`, which
   * is what lets Next, Vite and Metro all consume the same files with no build
   * step in between and no chance of a stale artefact. The cost is this line:
   * Next has to be told to compile it like first-party code.
   */
  transpilePackages: ["@supplies/core", "@supplies/db"],
};

export default nextConfig;
