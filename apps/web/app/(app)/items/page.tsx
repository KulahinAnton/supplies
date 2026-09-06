import Link from "next/link";
import { Boxes, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth-guard";
import {
  getArchivedItems,
  getItemGroups,
  getItemsPage,
} from "@supplies/db/queries";
import { formatQuantityWithUnit } from "@supplies/core/format";
import { todayUTC } from "@supplies/core/period";
import { Button } from "@supplies/ui/button";
import { ItemsList, type ItemRow } from "@/components/items-list";
import {
  parseFilter,
  parsePage,
  parsePerPage,
  parseSort,
} from "@supplies/core/item-list-params";

/**
 * Feature 27 + 28 — the list's whole view state travels in the URL: what is
 * being searched for, filtered and sorted, and which page of it.
 *
 * Reading it here rather than in the browser is what lets the server send one
 * page instead of the entire cupboard, and it means Back restores exactly what
 * was on screen.
 */
export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    filter?: string;
    cat?: string;
    sort?: string;
    page?: string;
    per?: string;
  }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const view = {
    query: params.q ?? "",
    filter: parseFilter(params.filter),
    category: params.cat ?? "all",
    sort: parseSort(params.sort, "name"),
    page: parsePage(params.page),
    perPage: parsePerPage(params.per),
  };

  const [page, archived, groups] = await Promise.all([
    getItemsPage(session.householdId, view),
    getArchivedItems(session.householdId),
    getItemGroups(session.householdId),
  ]);

  const today = todayUTC();

  // Decimal cannot cross the server/client boundary — format here.
  const rows: ItemRow[] = page.rows.map((item) => ({
    id: item.id,
    name: item.name,
    quantityLabel: formatQuantityWithUnit(item.quantity, item.unit),
    minQtyLabel: item.minQty.greaterThan(0)
      ? formatQuantityWithUnit(item.minQty, item.unit)
      : null,
    stock: item.stock,
    expiry: item.expiry,
    nextExpiryIso: item.nextExpiryIso,
    categoryName: item.categoryName,
    locationName: item.locationName,
    groupName: item.groupName,
    createdAtMs: item.createdAtMs,
  }));

  /**
   * "Nothing here" and "nothing matches" are different facts. The empty state
   * below is for a household with no items at all; a search that matches
   * nothing is the list's own business, since it still needs its search box.
   */
  const householdIsEmpty = page.total === 0 && !view.query && view.filter === "all" && view.category === "all";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Запаси</h1>
          <p className="text-sm text-muted-foreground">
            {page.total > 0 ? `${page.total} позицій` : "Поки порожньо"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {groups.length > 0 ? (
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

      {householdIsEmpty ? (
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
            categories={page.categories}
            todayIso={today.toISOString()}
            initialQuery={view.query}
            initialFilter={view.filter}
            initialCategory={view.category}
            initialSort={view.sort}
            page={page.page}
            pageCount={page.pageCount}
            perPage={view.perPage}
            total={page.total}
            from={page.from}
            to={page.to}
          />
          {archived.length > 0 ? (
            <div className="pt-1 text-center">
              <Link
                href="/items/archive"
                className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                Архів ({archived.length})
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
