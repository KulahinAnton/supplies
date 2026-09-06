import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDownUp, Boxes, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toDecimal } from "@supplies/core/decimal";
import { formatQuantityWithUnit } from "@supplies/core/format";
import {
  itemListSearch,
  parseItemListSearch,
  PAGE_SIZES,
  type ItemFilter,
  type ItemListState,
  type PerPage,
} from "@supplies/core/item-list-params";
import { ITEM_SORTS, ITEM_SORT_LABELS } from "@supplies/core/item-sort";
import { renderMessage } from "@supplies/core/messages";
import { todayUTC } from "@supplies/core/period";
import { BarcodeScanButton } from "@supplies/ui/barcode-scan-button";
import { Button } from "@supplies/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@supplies/ui/dropdown-menu";
import { Input } from "@supplies/ui/input";
import { ExpiryBadge, StockBadge } from "@supplies/ui/state-badges";
import { useItemSort } from "@supplies/ui/use-item-sort";
import { cn } from "@supplies/ui/utils";
import { api, ApiError } from "../api/client";
import { keys } from "../api/keys";
import { reviveItemView, type GroupView, type ItemsPage } from "../api/types";
import { ErrorNote, Spinner } from "../components/feedback";

const FILTERS: { value: ItemFilter; label: string }[] = [
  { value: "all", label: "Усі" },
  { value: "attention", label: "Потребують уваги" },
  { value: "OUT", label: "Закінчились" },
  { value: "LOW", label: "Закінчуються" },
];

/**
 * «Запаси» — ported from `apps/web/app/(app)/items/page.tsx` and
 * `components/items-list.tsx`.
 *
 * Feature 27 + 28: the whole view state travels in the URL, and the server
 * sends one page rather than the cupboard. The URL is written by
 * `itemListSearch` and read by `parseItemListSearch` — the same two functions
 * the Next page and the API use, which is what makes a filtered list here the
 * same link as a filtered list there.
 *
 * The one structural difference from the Next version: there, `page.tsx` reads
 * the URL on the server and `ItemsList` is a client component holding the
 * controls. Here both halves are the same component, because the fetch is a
 * query rather than a render.
 *
 * Still missing, knowingly: the «Створити ‹query›» affordance that sits under
 * a fruitless search (Feature 16.2), and the link to the archive.
 */
export function ItemsRoute() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const urlState = parseItemListSearch(params);

  const [query, setQuery] = useState(urlState.query);
  /**
   * Feature 21 — the outcome of the last scan. Deliberately NOT folded into
   * `query`: the text filter matches names, so a barcode there would empty the
   * list and then offer to create an item literally named "4823063114912".
   */
  const [scan, setScan] = useState<
    | { code: string; state: "searching" | "missing" }
    | { code: string; state: "error"; message: string }
    | null
  >(null);
  // Feature 12.2 — per-person, per-device. The URL wins when it says
  // something; the stored preference applies to a list opened fresh.
  const [sort, setSort] = useItemSort(params.get("sort") ?? undefined);

  /**
   * The «Набори» shortcut only exists once there is a set to look at. Loaded
   * as its own query rather than folded into the list response: the Next page
   * fetches it alongside the page because it is already on the server, and
   * here that would mean a second thing the items endpoint has to know about.
   */
  const groups = useQuery({
    queryKey: keys.groups,
    queryFn: () => api.get<GroupView[]>("/api/groups"),
  });

  const view: ItemListState = { ...urlState, sort };
  const search = itemListSearch(view);
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
     *
     * `isPlaceholderData` below is how the stale rows say so, rather than
     * pretending to be current.
     */
    placeholderData: keepPreviousData,
  });

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

  /**
   * Feature 21 — a hit navigates straight to the item, because the scan
   * already said exactly which one; making the reader pick it out of a
   * filtered list would be asking a question with one answer. A miss stays
   * here and offers to create it, carrying the code so it is never retyped.
   *
   * No memoisation at this call site: `BarcodeScanButton` reads the latest
   * callback through a ref, so this changing identity every render does not
   * restart the camera.
   */
  async function onScan(code: string) {
    setScan({ code, state: "searching" });
    try {
      const found = await api.get<
        { kind: "found"; itemId: string } | { kind: "missing" }
      >(`/api/barcode/${encodeURIComponent(code)}/item`);

      if (found.kind === "found") {
        void navigate(`/items/${found.itemId}`);
        return;
      }
      setScan({ code, state: "missing" });
    } catch (cause) {
      /**
       * Never report a failure as "you do not have this". A broken lookup once
       * shipped as a confident "not found" in the Next app, which read as data
       * and contradicted the item form. Saying nothing would have been better;
       * saying what actually happened is better still.
       *
       * `ApiError.message` is already the Ukrainian the API rendered from the
       * shared catalogue, so this is the same sentence the web app shows for
       * the same refusal.
       */
      setScan({
        code,
        state: "error",
        message:
          cause instanceof ApiError
            ? cause.message
            : renderMessage({ key: "error.unexpected" }),
      });
    }
  }

  const page = items.data;
  const householdIsEmpty =
    page?.total === 0 && !view.query && view.filter === "all" && view.category === "all";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Запаси</h1>
          <p className="text-sm text-muted-foreground">
            {page && page.total > 0 ? `${page.total} позицій` : "Поки порожньо"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {/* Feature 26 — no sets, no shortcut. An empty «Набори» page reached
              from a button that is always there is a dead end. */}
          {groups.data && groups.data.length > 0 ? (
            <Button
              variant="outline"
              size="icon"
              aria-label="Набори"
              nativeButton={false}
              render={<Link to="/groups" />}
            >
              <Boxes className="size-4" />
            </Button>
          ) : null}
          <Button nativeButton={false} render={<Link to="/items/new" />}>
            <Plus className="size-4" />
            Додати
          </Button>
        </div>
      </div>

      <ErrorNote error={items.error} />

      {householdIsEmpty ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Ще нічого немає. Додайте перший товар — наприклад, воду.
          </p>
          <Button
            className="mt-4"
            nativeButton={false}
            render={<Link to="/items/new" />}
          >
            <Plus className="size-4" />
            Додати товар
          </Button>
        </div>
      ) : (
        /*
         * The controls are OUTSIDE any `page &&`, and that is the whole point.
         *
         * They used to be inside one, so every debounced keystroke — which
         * changes the query key — unmounted the search field along with the
         * results, and the caret went with it. Typing more than one letter
         * meant clicking back into the box. A control that drives a query must
         * not be conditional on that query's data.
         */
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

            <BarcodeScanButton onScan={(code) => void onScan(code)} />

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" aria-label="Сортування">
                    <ArrowDownUp className="size-4" />
                    <span className="hidden sm:inline">{ITEM_SORT_LABELS[sort]}</span>
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
              <Chip
                key={option.value}
                active={view.filter === option.value}
                onClick={() => go({ filter: option.value, page: 1 })}
              >
                {option.label}
              </Chip>
            ))}
            <span className="w-px shrink-0 bg-border" />
            <Chip
              active={view.category === "all"}
              onClick={() => go({ category: "all", page: 1 })}
            >
              Усі категорії
            </Chip>
            {(page?.categories ?? []).map((name) => (
              <Chip
                key={name}
                active={view.category === name}
                onClick={() => go({ category: name, page: 1 })}
              >
                {name}
              </Chip>
            ))}
          </div>

          {/*
            Feature 21 — the scan result, directly under the search field where
            the reader is looking. A hit never reaches here; it has already
            navigated.
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
                    <Link to={`/items/new?barcode=${encodeURIComponent(scan.code)}`} />
                  }
                >
                  <Plus className="size-3.5" />
                  Створити
                </Button>
              </div>
            )
          ) : null}

          {items.isPending ? (
            <Spinner />
          ) : !page || page.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              Нічого не знайшли.
            </p>
          ) : (
            <ul
              /* Dimmed while a newer page is in flight, so stale rows do not
                 read as the answer to what was just typed. */
              className={cn(
                "divide-y rounded-lg border transition-opacity",
                items.isPlaceholderData && "opacity-60",
              )}
            >
              {page.rows.map(reviveItemView).map((item) => {
                // The Next page formats this server-side, where minQty is
                // still a Decimal. Over HTTP it is a string, so the same two
                // decisions — is it set, and how does it read — happen here.
                const minQtyLabel = toDecimal(item.minQty).greaterThan(0)
                  ? formatQuantityWithUnit(item.minQty, item.unit)
                  : null;

                return (
                <li key={item.id}>
                  <Link
                    to={`/items/${item.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-accent"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="truncate font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.categoryName}
                        {item.locationName ? ` · ${item.locationName}` : ""}
                        {minQtyLabel ? ` · мінімум ${minQtyLabel}` : ""}
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {/*
                          Feature 26.1 — a grouped item's own minimum is ignored
                          and it never appears in reminders on its own. Without
                          saying so here, an item sitting at zero and silently
                          absent from the shopping list looks like a bug.
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
                          date={item.nextExpiry}
                          today={today}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatQuantityWithUnit(item.quantity, item.unit)}
                    </div>
                  </Link>
                </li>
                );
              })}
            </ul>
          )}

          {/*
            Feature 28 — rendered whenever there is anything at all, not only
            when there are several pages: the page-size control is how you get
            back to seeing everything, so hiding it on short lists would strand
            anyone who chose 10 and then filtered down to 8.
          */}
          {page && page.total > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground tabular-nums">
                {page.from}–{page.to} з {page.total}
              </p>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  На сторінці
                  <select
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    value={String(view.perPage)}
                    onChange={(event) => {
                      const value = event.target.value;
                      // Back to page 1: page 7 of a 10-per-page list is
                      // nowhere in a 100-per-page one.
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

                {page.pageCount > 1 ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Попередня сторінка"
                      disabled={page.page <= 1}
                      onClick={() => go({ page: page.page - 1 })}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="min-w-16 text-center text-xs text-muted-foreground tabular-nums">
                      {page.page} / {page.pageCount}
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Наступна сторінка"
                      disabled={page.page >= page.pageCount}
                      onClick={() => go({ page: page.page + 1 })}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
