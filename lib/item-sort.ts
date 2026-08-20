/**
 * Feature 12.2 — ordering the stock list. Pure, so the tie-break rules are
 * stated once and tested.
 *
 * Sorting happens over rows already fetched, not as another query: the list is
 * small, the filters are already client-side, and changing the order must not
 * cost a round trip.
 */

export const ITEM_SORTS = ["name", "newest", "oldest"] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

export const ITEM_SORT_LABELS: Record<ItemSort, string> = {
  name: "За назвою",
  newest: "Спочатку нові",
  oldest: "Спочатку старі",
};

export function isItemSort(value: unknown): value is ItemSort {
  return typeof value === "string" && (ITEM_SORTS as readonly string[]).includes(value);
}

export type SortableItem = {
  name: string;
  /** Epoch milliseconds — `createdAt` does not survive the client boundary. */
  createdAtMs: number;
};

const byName = (a: SortableItem, b: SortableItem) =>
  a.name.localeCompare(b.name, "uk-UA");

/**
 * Every mode falls back to name, so the order is **total**: two items created
 * in the same second (the seed does exactly that) must not shuffle between
 * renders. Returns a new array — the input is left alone.
 */
export function sortItems<T extends SortableItem>(
  items: readonly T[],
  sort: ItemSort,
): T[] {
  const sorted = [...items];

  switch (sort) {
    case "newest":
      return sorted.sort(
        (a, b) => b.createdAtMs - a.createdAtMs || byName(a, b),
      );
    case "oldest":
      return sorted.sort(
        (a, b) => a.createdAtMs - b.createdAtMs || byName(a, b),
      );
    case "name":
    default:
      return sorted.sort(byName);
  }
}
