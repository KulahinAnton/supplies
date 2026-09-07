import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import {
  itemListSearch,
  parseItemListSearch,
  type ItemListState,
} from "@supplies/core/item-list-params";
import type { ItemSort } from "@supplies/core/item-sort";
import { useItemSort } from "@supplies/ui/use-item-sort";

/**
 * Feature 27 + 28 — the whole view state of «Запаси», and the one place that
 * writes it back to the URL.
 *
 * Extracted from `routes/items.tsx`, which held all of this inline alongside
 * the markup. The split is not cosmetic: the debounce, the "which control
 * resets the page" rule and the sort precedence are the three things on this
 * screen that are easy to get subtly wrong, and they are now readable in
 * thirty lines without a list row in sight.
 *
 * The URL is written by `itemListSearch` and read by `parseItemListSearch` —
 * the same two functions the Next page and the API use, which is what makes a
 * filtered list here the same link as a filtered list there.
 */
export type ItemListControls = {
  /** The state as the server should answer it, sort included. */
  view: ItemListState;
  /** `itemListSearch(view)` — the query string, already built. */
  search: string;
  /** The uncommitted text in the search box, which leads the URL by ~350 ms. */
  query: string;
  setQuery: (value: string) => void;
  /** Change any part of the view and navigate there. */
  go: (next: Partial<ItemListState>) => void;
  /**
   * Feature 12.2 — sorting is two writes, not one: the device remembers the
   * preference and the URL records what is on screen. Exposed as one function
   * so no caller can do half of it, which is how the two drift apart.
   */
  setSort: (sort: ItemSort) => void;
};

export function useItemList(): ItemListControls {
  const [params, setParams] = useSearchParams();
  const urlState = parseItemListSearch(params);

  const [query, setQuery] = useState(urlState.query);
  // Feature 12.2 — per-person, per-device. The URL wins when it says
  // something; the stored preference applies to a list opened fresh.
  const [sort, storeSort] = useItemSort(params.get("sort") ?? undefined);

  const view: ItemListState = { ...urlState, sort };

  /**
   * Every control states where it wants to go, rather than an effect watching
   * all the state and rewriting the URL. That effect could not tell a filter
   * change (go to page 1) from a pager click (go to page 4), and would bounce
   * the reader back to page 1 the moment they paged.
   */
  function go(next: Partial<ItemListState>) {
    const target = itemListSearch({ ...view, ...next });
    // `replace`, so paging through a list does not fill the Back button with
    // every page the reader passed on the way.
    setParams(new URLSearchParams(target), { replace: true });
  }

  /**
   * The search box keeps typing local and navigates once the reader pauses, so
   * the field stays responsive while the server still does the filtering — it
   * has to, since it is the one holding every item.
   */
  useEffect(() => {
    if (query === urlState.query) return;
    const timer = setTimeout(() => go({ query, page: 1 }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function setSort(next: ItemSort) {
    storeSort(next);
    go({ sort: next, page: 1 });
  }

  return { view, search: itemListSearch(view), query, setQuery, go, setSort };
}
