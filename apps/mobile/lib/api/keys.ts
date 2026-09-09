/**
 * The query-key map, written before the screens (SPA_API_PORT.md §9.5) — and
 * deliberately the same shape as the SPA's `api/keys.ts`.
 *
 * `revalidatePath` has no equivalent on a phone either. Every mutation has to
 * name what it invalidated, and the rule those encode is that **a stock write
 * changes four things**: the item's own quantity, its place in the list, the
 * dashboard's buckets, and the tab badges. Forgetting one is the classic bug —
 * a number in one place quietly disagreeing with another.
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
  itemNames: ["item-names"] as const,
  archive: ["archive"] as const,
  group: (id: string) => ["group", id] as const,
};

/** What a stock write makes stale, in one place, for every screen that writes. */
export const stockWriteInvalidates = [
  keys.items(),
  keys.dashboard,
  keys.attention,
  keys.shopping,
];

/**
 * What archiving or restoring makes stale, which is everything a stock write
 * touches **plus the archive itself**. Archiving removes an item from every
 * list at once, so the narrow invalidation is the wrong instinct here.
 */
export const archiveWriteInvalidates = [...stockWriteInvalidates, keys.archive];
