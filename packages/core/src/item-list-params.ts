/**
 * Feature 27 — the items list's view state, as URL parameters.
 *
 * Pure, so the rules about what belongs in a URL are stated once and tested:
 * a default is never written, so an untouched list stays at plain `/items`
 * rather than carrying four parameters that all say "nothing is set".
 */

import { isItemSort, type ItemSort } from "./item-sort";

export const ITEM_FILTERS = ["all", "attention", "OUT", "LOW"] as const;
export type ItemFilter = (typeof ITEM_FILTERS)[number];

/** Feature 28 — page sizes offered in the list. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PerPage = (typeof PAGE_SIZES)[number] | "all";

/**
 * Enough to fill a phone screen twice without asking for more, and small
 * enough that the page is cheap. "all" stays available for the person who
 * wants to scroll the whole cupboard.
 */
export const DEFAULT_PER_PAGE: PerPage = 25;

export function parsePerPage(value: unknown): PerPage {
  if (value === "all") return "all";
  const size = Number(value);
  return (PAGE_SIZES as readonly number[]).includes(size)
    ? (size as PerPage)
    : DEFAULT_PER_PAGE;
}

/** Page 1 for anything that is not a positive whole number. */
export function parsePage(value: unknown): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export type ItemListState = {
  query: string;
  filter: ItemFilter;
  category: string;
  sort: ItemSort;
  page: number;
  perPage: PerPage;
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
  if (state.perPage !== DEFAULT_PER_PAGE) params.set("per", String(state.perPage));
  // Page 1 is the default for every other change, so it never needs saying.
  if (state.page > 1) params.set("page", String(state.page));

  return params.toString();
}

/**
 * Feature 27.1 — rebuild a list query string from an untrusted one.
 *
 * The item page receives the list's state as a `from` parameter so its back
 * link can return to the exact view the user left. That value arrives in a
 * URL, so it is re-parsed and re-serialised rather than pasted through: only
 * the four known keys survive, and the filter and sort are validated. The
 * result can only ever describe a list this app can render.
 */
export function sanitizeListSearch(raw: string | undefined): string {
  return raw ? itemListSearch(parseItemListSearch(raw)) : "";
}

/**
 * The inverse of `itemListSearch` — a list URL back into the state it describes.
 *
 * This exists because the parameters were being read in three places and
 * written in one, and the readings had already drifted: the API had settled on
 * `category` and `perPage` while `itemListSearch` writes `cat` and `per`. The
 * effect was that a filtered list from the Next app was a link you could send
 * to another person, and the identical query string sent to the API quietly
 * fell back to "all categories, 25 per page" — a list that looked plausible
 * and was not the one asked for.
 *
 * Every unknown or malformed value falls back rather than throwing. These
 * arrive from URLs, which means from anywhere, and a hand-edited `?per=9999`
 * should show the default list rather than an error page.
 *
 * Accepts what each caller actually holds: a raw query string (`location.
 * search`), a parsed `URLSearchParams`, or the plain object Next hands a page
 * and Nest hands a controller.
 */
export function parseItemListSearch(
  source: string | URLSearchParams | Record<string, string | string[] | undefined>,
): ItemListState {
  const get = (key: string): string | undefined => {
    if (typeof source === "string") return new URLSearchParams(source).get(key) ?? undefined;
    if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
    const value = source[key];
    // A repeated parameter (`?cat=a&cat=b`) is a URL nobody meant to write.
    // Taking the first is arbitrary but stable, and beats `"a,b"`.
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    query: get("q")?.trim() ?? "",
    filter: parseFilter(get("filter")),
    category: get("cat") ?? "all",
    sort: parseSort(get("sort"), "name"),
    page: parsePage(get("page")),
    perPage: parsePerPage(get("per")),
  };
}
