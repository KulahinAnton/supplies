import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/auth-guard";
import { getArchivedItems } from "@/lib/queries";
import { formatQuantityWithUnit } from "@supplies/core/format";

/**
 * Feature 3 — archived items. They are hidden from every other screen, so this
 * page is the only way back: without it, archiving would be indistinguishable
 * from deleting.
 */
export default async function ArchivedItemsPage() {
  const session = await requireSession();
  const items = await getArchivedItems(session.householdId);

  return (
    <div className="space-y-5">
      <Link
        href="/items"
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

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          Архів порожній.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/items/${item.id}`}
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
