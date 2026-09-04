import Link from "next/link";
import { Boxes, ChevronRight } from "lucide-react";
import { requireSession } from "@/lib/auth-guard";
import { getItemGroupViews } from "@supplies/db/queries";
import { formatQuantityWithUnit, UNIT_SHORT } from "@supplies/core/format";
import { Button } from "@/components/ui/button";

export default async function GroupsPage() {
  const session = await requireSession();
  const groups = await getItemGroupViews(session.householdId);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Набори</h1>
          <p className="text-sm text-muted-foreground">
            Взаємозамінні товари з одним мінімумом на всіх.
          </p>
        </div>
        {/* Creating and deleting sets stays in Settings, beside categories and
            storage locations — this page is about what is IN them. */}
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/settings" />}
        >
          Керувати
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Наборів ще немає. Створіть перший у «Налаштування → Набори товарів»
            — наприклад, «Молоко» для кількох марок.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
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
                    {group.minQty.greaterThan(0)
                      ? ` · мінімум ${group.minQty.toString()}${group.unit ? ` ${UNIT_SHORT[group.unit]}` : ""}`
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
