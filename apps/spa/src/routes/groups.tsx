import { useQuery } from "@tanstack/react-query";
import { Boxes, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { toDecimal } from "@supplies/core/decimal";
import { formatQuantityWithUnit, UNIT_SHORT } from "@supplies/core/format";
import { Button } from "@supplies/ui/button";
import { api } from "../api/client";
import { keys } from "../api/keys";
import type { GroupView } from "../api/types";
import { ErrorNote, Spinner } from "../components/feedback";

/**
 * «Набори» — ported from `apps/web/app/(app)/groups/page.tsx`.
 *
 * Feature 26: a set is interchangeable products counted together, with one
 * minimum on all of them, so a household short of "milk" is reminded once
 * rather than once per brand.
 *
 * Creating and deleting sets stays in Settings, beside categories and storage
 * locations — this page is about what is IN them.
 */
export function GroupsRoute() {
  const groups = useQuery({
    queryKey: keys.groups,
    queryFn: () => api.get<GroupView[]>("/api/groups"),
  });

  if (groups.isPending) return <Spinner />;
  if (groups.isError) return <ErrorNote error={groups.error} />;
  if (!groups.data) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Набори</h1>
          <p className="text-sm text-muted-foreground">
            Взаємозамінні товари з одним мінімумом на всіх.
          </p>
        </div>
        <Button variant="outline" nativeButton={false} render={<Link to="/settings" />}>
          Керувати
        </Button>
      </div>

      {groups.data.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Наборів ще немає. Створіть перший у «Налаштування → Набори товарів»
            — наприклад, «Молоко» для кількох марок.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {groups.data.map((group) => (
            <li key={group.id}>
              <Link
                to={`/groups/${group.id}`}
                className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-accent"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate font-medium">
                    <Boxes className="size-4 shrink-0 text-muted-foreground" />
                    {group.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {/* Feature 26.4 — how much, not only how many. The same
                        number the settings panel shows, from the same query. */}
                    {group.unit
                      ? `товарів: ${group.memberCount} · разом ${formatQuantityWithUnit(group.quantity, group.unit)}`
                      : "порожній"}
                    {toDecimal(group.minQty).greaterThan(0)
                      ? ` · мінімум ${group.minQty}${group.unit ? ` ${UNIT_SHORT[group.unit]}` : ""}`
                      : " · без нагадувань"}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
