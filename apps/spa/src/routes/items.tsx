import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { formatQuantityWithUnit } from "@supplies/core/format";
import { todayUTC } from "@supplies/core/period";
import { Button } from "@supplies/ui/button";
import { Card, CardContent } from "@supplies/ui/card";
import { ExpiryBadge, StockBadge } from "@supplies/ui/state-badges";
import { cn } from "@supplies/ui/utils";
import { api } from "../api/client";
import { keys } from "../api/keys";
import { reviveItemView, type ItemsPage } from "../api/types";
import { EmptyNote, ErrorNote, Spinner } from "../components/feedback";

const FILTERS = [
  ["all", "Усі"],
  ["attention", "Потребують уваги"],
  ["OUT", "Немає"],
  ["LOW", "Закінчується"],
] as const;

/**
 * «Запаси» — the list.
 *
 * Feature 27's list state stays in the URL exactly as it does in the Next app,
 * so a filtered list is still a link someone can send. React Router's
 * `useSearchParams` replaces the one from `next/navigation`; the parsing
 * happens on the server, by the same `@supplies/core/item-list-params`
 * functions the web app uses.
 *
 * Phase 2.9 — still short of the Next list, and knowingly: no sort control,
 * no barcode scan, no archive toggle, no pagination controls. What it does
 * have now is the same badges, the same tokens and a working «Новий товар».
 */
export function ItemsRoute() {
  const [params, setParams] = useSearchParams();
  const query = Object.fromEntries(params);
  const today = todayUTC();

  const items = useQuery({
    queryKey: keys.items(query),
    queryFn: () =>
      api.get<ItemsPage>(`/api/items${params.toString() ? `?${params.toString()}` : ""}`),
  });

  const active = query.filter ?? "all";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Запаси</h1>
        <Button nativeButton={false} render={<Link to="/items/new" />}>
          <Plus className="size-4" />
          Новий товар
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("filter", value);
              // A filter change lands the reader on a different list, and
              // page 3 of the old one is not page 3 of the new one.
              next.delete("page");
              setParams(next);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              active === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {items.isPending ? <Spinner /> : null}
      <ErrorNote error={items.error} />

      <ul className="space-y-2">
        {items.data?.rows.map(reviveItemView).map((item) => (
          <li key={item.id}>
            <Link to={`/items/${item.id}`} className="block">
              <Card className="transition-colors hover:bg-accent">
                <CardContent>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{item.name}</span>
                    <span className="tabular-nums text-sm text-muted-foreground">
                      {formatQuantityWithUnit(item.quantity, item.unit)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{item.categoryName}</span>
                    <StockBadge state={item.stock} />
                    <ExpiryBadge
                      state={item.expiry}
                      date={item.nextExpiry}
                      today={today}
                    />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      {items.data && items.data.rows.length === 0 ? (
        <EmptyNote>Нічого не знайдено.</EmptyNote>
      ) : null}

      {items.data && items.data.pageCount > 1 ? (
        <p className="text-sm text-muted-foreground">
          Сторінка {items.data.page} з {items.data.pageCount} · {items.data.total}{" "}
          товарів
        </p>
      ) : null}
    </div>
  );
}
