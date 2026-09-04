/**
 * Feature 28 — choosing and ordering the items a list shows.
 *
 * Pure, and shared: this used to live inside the list component, which was
 * fine while the browser held every item. It cannot stay there now that the
 * server sends one page — filtering a single page in the browser would filter
 * the wrong set, silently, and the result would look plausible.
 *
 * It runs in JS rather than SQL because `stock` and `expiry` are DERIVED from
 * batches by the engine and never stored. Expressing them in SQL would mean a
 * second implementation of §3.4 and §3.5 that could disagree with the first.
 */

import { sortItems, type ItemSort, type SortableItem } from "./item-sort";
import type { ItemFilter } from "./item-list-params";
import type { ExpiryState } from "./expiry";
import type { StockState } from "./stock";

export type FilterableItem = SortableItem & {
  categoryName: string;
  stock: StockState;
  expiry: ExpiryState;
};

export type Selection = {
  query: string;
  filter: ItemFilter;
  category: string;
};

/** True when the item belongs in a list described by `selection`. */
export function matchesSelection(
  item: FilterableItem,
  selection: Selection,
): boolean {
  const needle = selection.query.trim().toLowerCase();
  if (needle && !item.name.toLowerCase().includes(needle)) return false;
  if (selection.category !== "all" && item.categoryName !== selection.category) {
    return false;
  }

  if (selection.filter === "OUT" || selection.filter === "LOW") {
    return item.stock === selection.filter;
  }
  if (selection.filter === "attention") {
    // Either axis being unhappy counts: an item can be well stocked and
    // half-expired, and this list is "what needs looking at".
    return (
      item.stock !== "OK" ||
      item.expiry === "EXPIRED" ||
      item.expiry === "SOON"
    );
  }
  return true;
}

export function selectItems<T extends FilterableItem>(
  items: readonly T[],
  selection: Selection,
  sort: ItemSort,
): T[] {
  return sortItems(
    items.filter((item) => matchesSelection(item, selection)),
    sort,
  );
}
