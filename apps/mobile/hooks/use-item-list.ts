import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  itemListSearch,
  type ItemFilter,
  type ItemListState,
} from "@supplies/core/item-list-params";
import type { ItemsPage } from "@supplies/core/contracts/items";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";

/**
 * Feature 27 + 28 — the list's view state, and the query it produces.
 *
 * **The URL is not the source of truth here, and that is the one real
 * difference from the web clients.** There, the whole view state lives in the
 * query string so a filtered list is a shareable link and the back button
 * restores it. A phone has no address bar to put it in, and Expo Router params
 * would make every filter tap a navigation — so the state is local and only
 * the search STRING is turned into a request.
 *
 * `itemListSearch` still builds that request, which is what keeps the three
 * clients asking the API the same questions.
 */
export function useItemList() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ItemFilter>("all");

  const view: ItemListState = {
    query,
    filter,
    category: "all",
    sort: "name",
    page: 1,
    // Feature 28 — a phone scrolls rather than pages. `all` asks the server for
    // the whole household in one response, which for a family's cupboard is a
    // few dozen rows; a pager on a touch screen would be a control nobody uses.
    perPage: "all",
  };

  const search = itemListSearch(view);

  const items = useQuery({
    queryKey: keys.items(Object.fromEntries(new URLSearchParams(search))),
    queryFn: () => api.get<ItemsPage>(`/api/items${search ? `?${search}` : ""}`),
    /**
     * Without this the list empties to `undefined` on every keystroke while
     * the new query loads, so rows vanish and reappear as someone types. On a
     * phone that reads as the app breaking rather than as it working.
     */
    placeholderData: keepPreviousData,
  });

  return { query, setQuery, filter, setFilter, items, view };
}
