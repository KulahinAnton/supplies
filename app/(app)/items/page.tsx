import Link from "next/link";
import { Boxes, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth-guard";
import { getArchivedItems, getItemGroups, getItemViews } from "@/lib/queries";
import { formatQuantityWithUnit } from "@/lib/format";
import { todayUTC } from "@/lib/period";
import { Button } from "@/components/ui/button";
import { ItemsList, type ItemRow } from "@/components/items-list";

export default async function ItemsPage() {
  const session = await requireSession();
  const items = await getItemViews(session.householdId);
  const archivedCount = (await getArchivedItems(session.householdId)).length;
  // Feature 26.2 — the entry point to the sets view, offered only once there
  // is something to look at. A permanent button for an unused feature is
  // clutter; an absent one for a used feature is a dead end.
  const groupCount = (await getItemGroups(session.householdId)).length;
  const today = todayUTC();

  // Decimal cannot cross the server/client boundary — format here.
  const rows: ItemRow[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    quantityLabel: formatQuantityWithUnit(item.quantity, item.unit),
    minQtyLabel: item.minQty.greaterThan(0)
      ? formatQuantityWithUnit(item.minQty, item.unit)
      : null,
    stock: item.stock,
    expiry: item.expiry,
    nextExpiryIso: item.nextExpiry ? item.nextExpiry.toISOString() : null,
    categoryName: item.categoryName,
    locationName: item.locationName,
    groupName: item.groupName,
    createdAtMs: item.createdAt.getTime(),
  }));

  const categories = [...new Set(items.map((item) => item.categoryName))].sort(
    (a, b) => a.localeCompare(b, "uk-UA"),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Запаси</h1>
          <p className="text-sm text-muted-foreground">
            {items.length > 0 ? `${items.length} позицій` : "Поки порожньо"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {groupCount > 0 ? (
            <Button
              variant="outline"
              size="icon"
              aria-label="Набори"
              nativeButton={false}
              render={<Link href="/groups" />}
            >
              <Boxes className="size-4" />
            </Button>
          ) : null}
          <Button nativeButton={false} render={<Link href="/items/new" />}>
            <Plus className="size-4" />
            Додати
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Ще нічого немає. Додайте перший товар — наприклад, воду.
          </p>
          <Button
            className="mt-4"
            nativeButton={false}
            render={<Link href="/items/new" />}
          >
            <Plus className="size-4" />
            Додати товар
          </Button>
        </div>
      ) : (
        <>
          <ItemsList
            items={rows}
            categories={categories}
            todayIso={today.toISOString()}
          />
          {archivedCount > 0 ? (
            <div className="pt-1 text-center">
              <Link
                href="/items/archive"
                className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                Архів ({archivedCount})
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
