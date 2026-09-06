/**
 * The query-key map, written **before** the screens (SPA_API_PORT.md §9.5).
 *
 * `revalidatePath` has no equivalent here. In the Next app a server action
 * says "this path is stale" and the framework re-renders it; here every
 * mutation has to name what it invalidated, and making those decisions one
 * screen at a time is how a cache starts lying.
 *
 * The rule these encode: **a stock write changes four things.** The item's own
 * quantity, its place in the list, the dashboard's three buckets, and the nav
 * badges. Forgetting the last one is the classic bug — the number in the corner
 * quietly disagreeing with the page under it.
 */
export const keys = {
  dashboard: ["dashboard"] as const,
  attention: ["attention"] as const,
  household: ["household"] as const,
  taxonomy: ["taxonomy"] as const,
  shopping: ["shopping"] as const,
  items: (params?: Record<string, string>) =>
    params ? (["items", params] as const) : (["items"] as const),
  item: (id: string) => ["item", id] as const,
  groups: ["groups"] as const,
  members: ["members"] as const,
  telegram: ["telegram"] as const,
  itemNames: ["item-names"] as const,
  group: (id: string) => ["group", id] as const,
};

/** What a stock write makes stale, in one place, for every screen that writes. */
export const stockWriteInvalidates = [
  keys.items(),
  keys.dashboard,
  keys.attention,
  keys.shopping,
];
