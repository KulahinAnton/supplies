import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { todayUTC } from "@supplies/core/period";
import { api } from "../api/client";
import { keys } from "../api/keys";
import type { ArchivedItem, GroupView, ItemsPage } from "../api/types";
import { ErrorNote, Spinner } from "../components/feedback";
import { CreateItemPrompt } from "../components/items/create-item-prompt";
import { ItemFilterChips } from "../components/items/item-filter-chips";
import { ItemSearchBar } from "../components/items/item-search-bar";
import {
  ArchiveLink,
  EmptyHousehold,
  ItemsHeader,
} from "../components/items/items-header";
import { ItemsTable } from "../components/items/items-table";
import { ListPagination } from "../components/items/list-pagination";
import { ScanResult } from "../components/items/scan-result";
import { useBarcodeLookup } from "../hooks/use-barcode-lookup";
import { useItemList } from "../hooks/use-item-list";

/**
 * «Запаси» — the counterpart of `apps/web/app/(app)/items/page.tsx` plus
 * `components/items-list.tsx`.
 *
 * Feature 27 + 28: the whole view state travels in the URL and the server
 * sends one page rather than the cupboard. `useItemList` owns that state; this
 * file is composition and four queries, and nothing else.
 *
 * The structural difference from the Next version is unchanged: there,
 * `page.tsx` reads the URL on the server and `ItemsList` is a client component
 * holding the controls. Here the fetch is a query, so both halves are one
 * component tree — but the controls still live above the data, for the reason
 * spelled out in `ItemSearchBar`.
 */
export function ItemsRoute() {
  const { view, search, query, setQuery, go, setSort } = useItemList();
  const { scan, clear: clearScan, lookUp } = useBarcodeLookup();
  const today = todayUTC();

  const items = useQuery({
    queryKey: keys.items(Object.fromEntries(new URLSearchParams(search))),
    queryFn: () => api.get<ItemsPage>(`/api/items${search ? `?${search}` : ""}`),
    /**
     * Every filter, sort, page and debounced search term is a different key,
     * and without this each one empties the list to `undefined` while the new
     * one loads — so the rows vanish and reappear on every keystroke and every
     * page click. Holding the previous page until the next arrives is what the
     * server-rendered version gets for free.
     */
    placeholderData: keepPreviousData,
  });

  /**
   * Loaded as its own query rather than folded into the list response: the
   * Next page fetches these alongside the page because it is already on the
   * server, and here that would mean two more things the items endpoint has to
   * know about.
   */
  const groups = useQuery({
    queryKey: keys.groups,
    queryFn: () => api.get<GroupView[]>("/api/groups"),
  });

  const archived = useQuery({
    queryKey: keys.archive,
    queryFn: () => api.get<ArchivedItem[]>("/api/items/archive"),
  });

  const page = items.data;
  const householdIsEmpty =
    page?.total === 0 && !view.query && view.filter === "all" && view.category === "all";

  return (
    <div className="space-y-5">
      <ItemsHeader total={page?.total} hasGroups={(groups.data?.length ?? 0) > 0} />

      <ErrorNote error={items.error} />

      {householdIsEmpty ? (
        <EmptyHousehold />
      ) : (
        <div className="space-y-4">
          <ItemSearchBar
            query={query}
            onQueryChange={(value) => {
              setQuery(value);
              // Typing a name replaces the scan as the active question; a stale
              // barcode hint below the field would answer neither.
              clearScan();
            }}
            sort={view.sort}
            onSortChange={setSort}
            onScan={lookUp}
          />

          <ItemFilterChips
            filter={view.filter}
            category={view.category}
            categories={page?.categories ?? []}
            onChange={(next) => go({ ...next, page: 1 })}
          />

          <ScanResult scan={scan} />

          {/* Feature 16.2 — only when a search is what produced this list, and
              never while a scan is the active question: two different offers to
              create something, stacked, is a screen arguing with itself. */}
          {scan ? null : (
            <CreateItemPrompt
              query={query}
              hasResults={(page?.rows.length ?? 0) > 0}
            />
          )}

          {items.isPending ? (
            <Spinner />
          ) : (
            <ItemsTable
              rows={page?.rows ?? []}
              today={today}
              stale={items.isPlaceholderData}
            />
          )}

          {page && page.total > 0 ? (
            <ListPagination
              from={page.from}
              to={page.to}
              total={page.total}
              page={page.page}
              pageCount={page.pageCount}
              perPage={view.perPage}
              onPage={(next) => go({ page: next })}
              // Back to page 1: page 7 of a 10-per-page list is nowhere in a
              // 100-per-page one.
              onPerPage={(perPage) => go({ perPage, page: 1 })}
            />
          ) : null}

          <ArchiveLink count={archived.data?.length ?? 0} />
        </div>
      )}
    </div>
  );
}
