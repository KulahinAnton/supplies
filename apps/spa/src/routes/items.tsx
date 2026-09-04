import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { api } from "../api/client";
import { keys } from "../api/keys";
import type { ItemsPage } from "../api/types";
import { formatQuantityWithUnit } from "@supplies/core/format";
import { Card, ErrorNote, ExpiryBadge, Spinner, StockBadge } from "../components/ui";

/**
 * «Запаси» — the list.
 *
 * Feature 27's list state stays in the URL exactly as it does in the Next app,
 * so a filtered list is still a link someone can send. React Router's
 * `useSearchParams` replaces `useSearchParams` from `next/navigation`; the
 * parsing happens on the server, by the same `@supplies/core/item-list-params`
 * functions the web app uses.
 */
export function ItemsRoute() {
  const [params, setParams] = useSearchParams();
  const query = Object.fromEntries(params) as Record<string, string>;

  const items = useQuery({
    queryKey: keys.items(query),
    queryFn: () =>
      api.get<ItemsPage>(`/api/items${params.toString() ? `?${params.toString()}` : ""}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "Усі"],
            ["attention", "Потребують уваги"],
            ["OUT", "Немає"],
            ["LOW", "Закінчується"],
          ] as const
        ).map(([value, label]) => {
          const active = (query.filter ?? "all") === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("filter", value);
                next.delete("page");
                setParams(next);
              }}
              className={`rounded-full border px-3 py-1 text-sm ${
                active
                  ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                  : "border-neutral-200 text-neutral-600"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {items.isPending ? <Spinner /> : null}
      <ErrorNote error={items.error} />

      <ul className="space-y-2">
        {items.data?.rows.map((item) => (
          <li key={item.id}>
            <Link to={`/items/${item.id}`} className="block">
              <Card className="transition hover:border-emerald-300">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{item.name}</span>
                  <span className="tabular-nums text-sm text-neutral-600">
                    {formatQuantityWithUnit(item.quantity, item.unit)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span>{item.categoryName}</span>
                  <StockBadge state={item.stock} />
                  <ExpiryBadge state={item.expiry} />
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      {items.data && items.data.rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Нічого не знайдено.</p>
      ) : null}

      {items.data && items.data.pageCount > 1 ? (
        <p className="text-sm text-neutral-500">
          Сторінка {items.data.page} з {items.data.pageCount} · {items.data.total} товарів
        </p>
      ) : null}
    </div>
  );
}
