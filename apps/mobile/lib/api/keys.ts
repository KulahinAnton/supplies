/**
 * The query-key map, written before the screens (SPA_API_PORT.md §9.5) — and
 * deliberately the same shape as the SPA's `api/keys.ts`.
 *
 * `revalidatePath` has no equivalent on a phone either. Every mutation has to
 * name what it invalidated, and the rule those encode is that **a stock write
 * changes four things**: the item's own quantity, its place in the list, the
 * dashboard's buckets, and the shopping candidates. Forgetting one is the
 * classic bug — a number in one place quietly disagreeing with another.
 */
export const keys = {
  dashboard: ["dashboard"] as const,
  attention: ["attention"] as const,
  shopping: ["shopping"] as const,
  items: (params?: Record<string, string>) =>
    params ? (["items", params] as const) : (["items"] as const),
  item: (id: string) => ["item", id] as const,
};

/** What a stock write makes stale, in one place, for every screen that writes. */
export const stockWriteInvalidates = [
  keys.items(),
  keys.dashboard,
  keys.attention,
  keys.shopping,
];
