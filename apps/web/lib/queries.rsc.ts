import "server-only";
import { cache } from "react";
import {
  getAttentionCounts as uncachedAttentionCounts,
  getDashboard as uncachedDashboard,
  getHousehold as uncachedHousehold,
  getItemViews as uncachedItemViews,
} from "@supplies/db/queries";

/**
 * Feature 33 — the same readers, deduplicated within one request.
 *
 * Every authed page renders through `app/(app)/layout.tsx`, which calls
 * `getAttentionCounts` for the nav badges — and that loads every item, every
 * batch and every category. The page underneath then loads the same thing
 * again for itself, and `getHousehold` gets asked two or three times on top.
 * One navigation, the household scanned twice and a trivial row fetched
 * repeatedly.
 *
 * At 72 items none of that is slow in the database. What it costs is
 * ROUND TRIPS to Neon, and those are latency the user feels on every page.
 *
 * `React.cache` gives per-request memoization, so the second caller in the
 * same render gets the first one's promise. It is not a cache across requests:
 * nothing here goes stale between two page loads.
 *
 * **Why a separate module, and why `server-only`.** `lib/queries.ts`
 * deliberately has plain-Node consumers — `pnpm bot:start` and
 * `pnpm digest:run` — and `server-only` throws outside a React Server
 * Component build (see the gotcha in CLAUDE.md). Wrapping the originals in
 * place would either kill both entry points or lean on request-scoped caching
 * where no request exists. So the cached readers live here, the raw ones stay
 * exported, and the import you choose says which world you are in:
 *
 * - pages, layouts and server components → this module
 * - the bot, the digest, scripts → `lib/queries.ts`
 */

export const getHousehold = cache(uncachedHousehold);

/**
 * Each wrapper hands the one below it what it already loaded. Memoizing only
 * the outer calls is not enough — measured, the household row was still read
 * three times per render because `getItemViews` and `getDashboard` fetched
 * their own copies internally.
 */
export const getItemViews = cache(async (householdId: string) =>
  uncachedItemViews(householdId, await getHousehold(householdId)),
);

/**
 * Memoizing the outer function alone would not have been enough: the expensive
 * scan is *inside* these two, and each would still have loaded its own copy.
 * They take the item views as an optional argument for exactly this reason, so
 * the cached loader above is what both of them end up sharing.
 *
 * The layout's badges and the dashboard beneath it now cost one scan between
 * them, not two.
 */
export const getAttentionCounts = cache(async (householdId: string) =>
  uncachedAttentionCounts(householdId, await getItemViews(householdId)),
);

export const getDashboard = cache(async (householdId: string) =>
  uncachedDashboard(householdId, {
    items: await getItemViews(householdId),
    household: await getHousehold(householdId),
  }),
);
