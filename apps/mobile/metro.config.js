const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

/**
 * SPA_API_PORT.md §9.2 — the risk this file exists to close.
 *
 * Metro was written for a single application directory and finds modules by
 * walking `node_modules` upward from the importer. pnpm gives every package a
 * private `node_modules` full of symlinks into a content-addressed store, and
 * `packages/core` is not under `apps/mobile` at all. Without the three
 * settings below, `import { stockState } from "@supplies/core/stock"` resolves
 * to nothing and the failure reads as a missing module rather than a missing
 * configuration.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole workspace, or an edit to packages/core never triggers a
//    rebuild and the app serves a stale copy of a rule you just changed.
config.watchFolders = [workspaceRoot];

// 2. Look in both stores. The app's own first, so a version pinned here wins.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

/**
 * 3. The upward walk stays ON, and this is the one setting where the common
 *    monorepo advice is wrong for pnpm.
 *
 *    `disableHierarchicalLookup = true` is what every npm/yarn workspace guide
 *    reaches for, because with a hoisted `node_modules` the upward walk finds
 *    packages the app never declared and a phantom dependency ends up in the
 *    bundle. pnpm does not hoist: every package gets a private `node_modules`
 *    holding exactly its own declared dependencies, and the upward walk from
 *    a file inside it finds precisely those.
 *
 *    Turning it off here was tried and reverted within the hour. `expo-router`
 *    imports `@expo/metro-runtime`, which imports `whatwg-fetch`, neither of
 *    which this app declares nor should — and with the walk disabled, Metro
 *    could only see `apps/mobile/node_modules` and the workspace root, so the
 *    bundle failed on somebody else's transitive dependency. The fix was not
 *    to adopt twenty of Expo's dependencies as our own.
 */
config.resolver.disableHierarchicalLookup = false;

/**
 * `packages/core` has no barrel and publishes subpaths only — `./stock`,
 * `./validation/item`, and so on — through its `exports` map. That is
 * deliberate (packages/core/CLAUDE.md: a barrel would drag `node:crypto` into
 * every mobile screen's module graph), and it means Metro must honour
 * `exports` or none of those specifiers resolve.
 */
config.resolver.unstable_enablePackageExports = true;

module.exports = withNativeWind(config, { input: "./global.css" });
