"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownUp,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { BarcodeScanButton } from "@supplies/ui/barcode-scan-button";
import { findItemByBarcodeAction } from "@/lib/actions/barcode";
import { Button } from "@supplies/ui/button";
import { renderMessage } from "@supplies/core/messages";
import { Input } from "@supplies/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@supplies/ui/dropdown-menu";
import { ExpiryBadge, StockBadge } from "@supplies/ui/state-badges";
import { useItemSort } from "@supplies/ui/use-item-sort";
import {
  itemListSearch,
  parseFilter,
  PAGE_SIZES,
  type ItemFilter,
  type ItemListState,
  type PerPage,
} from "@supplies/core/item-list-params";
import { ITEM_SORTS, ITEM_SORT_LABELS } from "@supplies/core/item-sort";
import type { ExpiryState } from "@supplies/core/expiry";
import type { StockState } from "@supplies/core/stock";
import { cn } from "@supplies/ui/utils";

/**
 * Serialised `ItemView` — Decimal does not survive the server/client boundary,
 * so the page hands over pre-formatted strings.
 */
export type ItemRow = {
  id: string;
  name: string;
  quantityLabel: string;
  minQtyLabel: string | null;
  stock: StockState;
  expiry: ExpiryState;
  nextExpiryIso: string | null;
  categoryName: string;
  locationName: string | null;
  /** Feature 26.1 — the set this item is counted with, if any. */
  groupName: string | null;
  /** Epoch ms — Date does not survive the server/client boundary intact. */
  createdAtMs: number;
};

/**
 * Feature 27 — one definition, in lib, shared with the URL parser.
 *
 * This used to be `"all" | "attention" | StockState`, which admitted "OK" —
 * a filter the chips never offer and the list would have shown nothing for.
 */
type Filter = ItemFilter;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Усі" },
  { value: "attention", label: "Потребують уваги" },
  { value: "OUT", label: "Закінчились" },
  { value: "LOW", label: "Закінчуються" },
];

export function ItemsList({
  items,
  categories,
  todayIso,
  initialQuery = "",
  initialFilter,
  initialCategory,
  initialSort,
  page,
  pageCount,
  perPage,
  total,
  from,
  to,
}: {
  items: ItemRow[];
  categories: string[];
  todayIso: string;
  /** Feature 27 — restored from the URL, so Back brings the list back. */
  initialQuery?: string;
  initialFilter?: string;
  initialCategory?: string;
  initialSort?: string;
  /** Feature 28 — the server paginates; these describe the slice it sent. */
  page: number;
  pageCount: number;
  perPage: PerPage;
  total: number;
  from: number;
  to: number;
}) {
  const [query, setQuery] = useState(initialQuery);
  /**
   * Feature 21 — the outcome of the last scan. Deliberately NOT folded into
   * `query`: the text filter matches names, so a barcode there would empty
   * the list and then offer to create an item literally named "4823063114912".
   */
  const [scan, setScan] = useState<
    | { code: string; state: "searching" | "missing" }
    | { code: string; state: "error"; message: string }
    | null
  >(null);
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(parseFilter(initialFilter));
  const [category, setCategory] = useState<string>(initialCategory ?? "all");
  // Feature 12.2 — per-person, per-device, like the group collapse state.
  const [sort, setSort] = useItemSort(initialSort);
  const today = useMemo(() => new Date(todayIso), [todayIso]);

  /**
   * Feature 27 + 28 — every control states where it wants to go.
   *
   * An effect that watched all the state and rewrote the URL could not tell a
   * filter change (go to page 1) from a pager click (go to page 4), and would
   * bounce the user back to page 1 the moment they paged. Each control says
   * what it means instead.
   *
   * `router.replace`, not `history.replaceState`: the latter never tells
   * Next's router, so Back would be answered from a stale cached payload.
   */
  const current: ItemListState = { query, filter, category, sort, page, perPage };

  const go = useCallback(
    (next: Partial<ItemListState>) => {
      const search = itemListSearch({ ...current, ...next });
      router.replace(search ? `/items?${search}` : "/items", { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, query, filter, category, sort, page, perPage],
  );

  /**
   * The search box keeps typing local and navigates once the user pauses, so
   * the field stays responsive while the server still does the filtering —
   * it has to, since it is the one holding every item.
   */
  useEffect(() => {
    if (query === initialQuery) return;
    const timer = setTimeout(() => go({ query, page: 1 }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const search = itemListSearch(current);

  const itemHref = (id: string) =>
    search ? `/items/${id}?from=${encodeURIComponent(search)}` : `/items/${id}`;

  useEffect(() => {
    const next = search ? `/items?${search}` : "/items";
    const current = `${window.location.pathname}${window.location.search}`;
    if (next === current) return;

    const timer = setTimeout(() => router.replace(next, { scroll: false }), 350);
    return () => clearTimeout(timer);
  }, [search, router]);

  /**
   * A hit navigates straight to the item — the scan already said exactly which
   * one, so making the user pick it out of a filtered list would be asking a
   * question that has only one answer. A miss stays on the page and offers to
   * create it, carrying the code so it is never retyped.
   */
  async function onScan(code: string) {
    setScan({ code, state: "searching" });
    const result = await findItemByBarcodeAction(code);

    if (!result.ok) {
      // Never report a failure as "you do not have this". A broken lookup
      // once shipped as a confident "not found" here, which read as data and
      // contradicted the item form; saying nothing would have been better,
      // and saying what actually happened is better still.
      setScan({ code, state: "error", message: renderMessage(result.error) });
      return;
    }

    if (result.data.kind === "found") {
      router.push(`/items/${result.data.itemId}`);
      return;
    }

    setScan({ code, state: "missing" });
  }


  /**
   * Feature 28 — `items` IS the result: the server filtered, sorted and sliced
   * it. Filtering again here would filter one page rather than the household,
   * and would look right while being wrong.
   */
  const visible = items;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              // Typing a name replaces the scan as the active question; a
              // stale barcode hint below the field would answer neither.
              setScan(null);
            }}
            placeholder="Пошук за назвою…"
            className="pl-9"
            type="search"
          />
        </div>

        <BarcodeScanButton onScan={onScan} />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" aria-label="Сортування">
                <ArrowDownUp className="size-4" />
                <span className="hidden sm:inline">
                  {ITEM_SORT_LABELS[sort]}
                </span>
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {ITEM_SORTS.map((option) => (
              <DropdownMenuItem
                key={option}
                onClick={() => {
                  setSort(option);
                  go({ sort: option, page: 1 });
                }}
                className={option === sort ? "font-semibold" : undefined}
              >
                {ITEM_SORT_LABELS[option]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setFilter(option.value);
              go({ filter: option.value, page: 1 });
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              filter === option.value
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {option.label}
          </button>
        ))}
        <span className="w-px shrink-0 bg-border" />
        <button
          type="button"
          onClick={() => {
            setCategory("all");
            go({ category: "all", page: 1 });
          }}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
            category === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          Усі категорії
        </button>
        {categories.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              setCategory(name);
              go({ category: name, page: 1 });
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              category === name
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {name}
          </button>
        ))}
      </div>

      {/*
        Feature 21 — the scan result, directly under the search field where the
        user is looking. A hit never reaches here; it has already navigated.
      */}
      {scan ? (
        scan.state === "searching" ? (
          <p className="text-sm text-muted-foreground">Шукаємо за штрихкодом…</p>
        ) : scan.state === "error" ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {scan.message}
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2">
            <p className="min-w-0 text-xs text-muted-foreground">
              Штрихкоду{" "}
              <span className="font-medium text-foreground">{scan.code}</span>{" "}
              ще немає серед ваших запасів.
            </p>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  href={`/items/new?barcode=${encodeURIComponent(scan.code)}`}
                />
              }
            >
              <Plus className="size-3.5" />
              Створити
            </Button>
          </div>
        )
      ) : null}

      {/*
        Feature 16.2 — searching is the first act, creating the fallback. Most
        duplicates exist because the person could not find the item, so the
        create affordance appears next to the search results rather than being
        the obvious path at the top of the page. The query is carried into the
        form so nothing is retyped.
      */}
      {query.trim().length > 0 && !scan ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2">
          <p className="min-w-0 text-xs text-muted-foreground">
            {visible.length > 0
              ? "Не те, що шукали?"
              : `Нічого не знайшли за запитом «${query.trim()}».`}
          </p>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <Link
                href={`/items/new?name=${encodeURIComponent(query.trim())}`}
              />
            }
          >
            <Plus className="size-3.5" />
            Створити «{query.trim()}»
          </Button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        query.trim().length > 0 ? null : (
          <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            Нічого не знайшли.
          </p>
        )
      ) : (
        <ul className="divide-y rounded-lg border">
          {visible.map((item) => (
            <li key={item.id}>
              <Link
                href={itemHref(item.id)}
                className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-accent"
              >
                <div className="min-w-0 space-y-1">
                  <div className="truncate font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.categoryName}
                    {item.locationName ? ` · ${item.locationName}` : ""}
                    {item.minQtyLabel ? ` · мінімум ${item.minQtyLabel}` : ""}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {/*
                      Feature 26.1 — a grouped item's own minimum is ignored and
                      it never appears in reminders on its own. Without saying
                      so here, an item sitting at zero and silently absent from
                      the shopping list looks like a bug.
                    */}
                    {item.groupName ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground">
                        <Boxes className="size-3" />
                        {item.groupName}
                      </span>
                    ) : null}
                    <StockBadge state={item.stock} />
                    <ExpiryBadge
                      state={item.expiry}
                      date={item.nextExpiryIso ? new Date(item.nextExpiryIso) : null}
                      today={today}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm font-semibold tabular-nums">
                  {item.quantityLabel}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/*
        Feature 28 — the pager. Rendered whenever there is anything at all, not
        only when there are several pages: the page-size control is how you get
        back to seeing everything, so hiding it on short lists would strand
        anyone who had chosen 10 and then filtered down to 8.
      */}
      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground tabular-nums">
            {from}–{to} з {total}
          </p>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              На сторінці
              <select
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={String(perPage)}
                onChange={(event) => {
                  const value = event.target.value;
                  // Back to page 1: page 7 of a 10-per-page list is nowhere in
                  // a 100-per-page one.
                  go({
                    perPage: value === "all" ? "all" : (Number(value) as PerPage),
                    page: 1,
                  });
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
                <option value="all">усі</option>
              </select>
            </label>

            {pageCount > 1 ? (
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Попередня сторінка"
                  disabled={page <= 1}
                  onClick={() => go({ page: page - 1 })}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="min-w-16 text-center text-xs text-muted-foreground tabular-nums">
                  {page} / {pageCount}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Наступна сторінка"
                  disabled={page >= pageCount}
                  onClick={() => go({ page: page + 1 })}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

