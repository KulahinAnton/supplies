"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDownUp, Boxes, Plus, Search } from "lucide-react";
import { BarcodeScanButton } from "@/components/barcode-scan-button";
import { findItemByBarcodeAction } from "@/lib/actions/barcode";
import { Button } from "@/components/ui/button";
import { renderMessage } from "@/lib/messages";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExpiryBadge, StockBadge } from "@/components/state-badges";
import { useItemSort } from "@/hooks/use-item-sort";
import {
  itemListSearch,
  parseFilter,
  type ItemFilter,
} from "@/lib/item-list-params";
import { ITEM_SORTS, ITEM_SORT_LABELS, sortItems } from "@/lib/item-sort";
import type { ExpiryState } from "@/lib/expiry";
import type { StockState } from "@/lib/stock";
import { cn } from "@/lib/utils";

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
}: {
  items: ItemRow[];
  categories: string[];
  todayIso: string;
  /** Feature 27 — restored from the URL, so Back brings the list back. */
  initialQuery?: string;
  initialFilter?: string;
  initialCategory?: string;
  initialSort?: string;
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
   * Feature 27 — keep the URL describing what is on screen.
   *
   * `router.replace`, not `history.replaceState`. replaceState is cheaper —
   * no server round trip — but it never tells Next's router, so Back was
   * answered from the cached payload for a bare /items and the restored
   * parameters were promptly overwritten by this effect. A real navigation
   * keeps the router cache keyed by the URL the user actually sees.
   *
   * Debounced, because the search box would otherwise navigate on every
   * keystroke. The equality check makes the mount pass a no-op: on arrival the
   * URL already describes the state it seeded.
   */
  const search = itemListSearch({ query, filter, category, sort });

  /**
   * Feature 27.1 — the item page's back link needs to know which view it was
   * opened from; it cannot work that out for itself. Carrying it on the link
   * also means the back link still works after a refresh, which a history
   * based approach would not.
   */
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


  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = items.filter((item) => {
      if (needle && !item.name.toLowerCase().includes(needle)) return false;
      if (category !== "all" && item.categoryName !== category) return false;
      if (filter === "OUT" || filter === "LOW") return item.stock === filter;
      if (filter === "attention") {
        return (
          item.stock !== "OK" ||
          item.expiry === "EXPIRED" ||
          item.expiry === "SOON"
        );
      }
      return true;
    });
    return sortItems(matched, sort);
  }, [items, query, filter, category, sort]);

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
                onClick={() => setSort(option)}
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
            onClick={() => setFilter(option.value)}
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
          onClick={() => setCategory("all")}
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
            onClick={() => setCategory(name)}
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
    </div>
  );
}

