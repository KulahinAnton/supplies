import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { formatQuantityWithUnit } from "@supplies/core/format";
import { api } from "../api/client";
import { keys } from "../api/keys";
import type { ArchivedItem } from "../api/types";
import { ErrorNote, Spinner } from "../components/feedback";

/**
 * Feature 3 — archived items, ported from
 * `apps/web/app/(app)/items/archive/page.tsx`.
 *
 * They are hidden from every other screen, so this page is the only way back:
 * without it, archiving would be indistinguishable from deleting. That is also
 * why the copy says the history is kept — the movements still reference the
 * item, and someone deciding whether to archive needs to know that before they
 * do it, not after.
 */
export function ItemsArchiveRoute() {
  const archived = useQuery({
    queryKey: keys.archive,
    queryFn: () => api.get<ArchivedItem[]>("/api/items/archive"),
  });

  return (
    <div className="space-y-5">
      <Link
        to="/items"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Запаси
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Архів</h1>
        <p className="text-sm text-muted-foreground">
          Ці товари приховані зі списків і нагадувань. Історія збережена.
        </p>
      </div>

      <ErrorNote error={archived.error} />

      {archived.isPending ? (
        <Spinner />
      ) : (archived.data?.length ?? 0) === 0 ? (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          Архів порожній.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {archived.data?.map((item) => (
            <li key={item.id}>
              <Link
                to={`/items/${item.id}`}
                className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-accent"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.categoryName}
                  </div>
                </div>
                <div className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatQuantityWithUnit(item.quantity, item.unit)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
