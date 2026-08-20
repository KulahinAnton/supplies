"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExpiryBadge, StockBadge } from "@/components/state-badges";
import { useItemSort } from "@/hooks/use-item-sort";
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
  /** Epoch ms — Date does not survive the server/client boundary intact. */
  createdAtMs: number;
};

type Filter = "all" | "attention" | StockState;

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
}: {
  items: ItemRow[];
  categories: string[];
  todayIso: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<string>("all");
  // Feature 12.2 — per-person, per-device, like the group collapse state.
  const [sort, setSort] = useItemSort();
  const today = useMemo(() => new Date(todayIso), [todayIso]);

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
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Пошук за назвою…"
            className="pl-9"
            type="search"
          />
        </div>

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
        Feature 16.2 — searching is the first act, creating the fallback. Most
        duplicates exist because the person could not find the item, so the
        create affordance appears next to the search results rather than being
        the obvious path at the top of the page. The query is carried into the
        form so nothing is retyped.
      */}
      {query.trim().length > 0 ? (
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
                href={`/items/${item.id}`}
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

