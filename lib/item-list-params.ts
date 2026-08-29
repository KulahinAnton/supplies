/**
 * Feature 27 — the items list's view state, as URL parameters.
 *
 * Pure, so the rules about what belongs in a URL are stated once and tested:
 * a default is never written, so an untouched list stays at plain `/items`
 * rather than carrying four parameters that all say "nothing is set".
 */

import { isItemSort, type ItemSort } from "@/lib/item-sort";

export const ITEM_FILTERS = ["all", "attention", "OUT", "LOW"] as const;
export type ItemFilter = (typeof ITEM_FILTERS)[number];

export type ItemListState = {
  query: string;
  filter: ItemFilter;
  category: string;
  sort: ItemSort;
};

/** A stale or hand-edited value falls back rather than breaking the list. */
export function parseFilter(value: unknown): ItemFilter {
  return typeof value === "string" &&
    (ITEM_FILTERS as readonly string[]).includes(value)
    ? (value as ItemFilter)
    : "all";
}

export function parseSort(value: unknown, fallback: ItemSort): ItemSort {
  return isItemSort(value) ? value : fallback;
}

/**
 * The query string for a view, or "" when nothing differs from the default.
 *
 * The search text is trimmed: trailing spaces change the URL without changing
 * what the user sees, which would make Back restore a subtly different thing.
 */
export function itemListSearch(state: ItemListState): string {
  const params = new URLSearchParams();
  const query = state.query.trim();

  if (query) params.set("q", query);
  if (state.filter !== "all") params.set("filter", state.filter);
  if (state.category !== "all") params.set("cat", state.category);
  if (state.sort !== "name") params.set("sort", state.sort);

  return params.toString();
}
