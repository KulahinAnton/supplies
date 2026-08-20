import { requireSession } from "@/lib/auth-guard";
import { getShoppingView } from "@/lib/queries";
import { formatQuantityWithUnit } from "@/lib/format";
import {
  ShoppingList,
  type Candidate,
  type ListRow,
} from "@/components/shopping-list";

export default async function ShoppingPage() {
  const session = await requireSession();
  const { rows, candidates, groups } = await getShoppingView(session.householdId);

  const listRows: ListRow[] = rows.map((row) => ({
    id: row.id,
    label: row.item?.name ?? row.freeText ?? "—",
    itemId: row.itemId,
    groupId: row.groupId,
    note: row.note,
    unit: row.item?.unit ?? null,
    isChecked: row.isChecked,
    addedBy: row.addedBy.name,
    checkedBy: row.checkedBy?.name ?? null,
  }));

  const suggestions: Candidate[] = candidates.map((candidate) => ({
    itemId: candidate.itemId,
    name: candidate.name,
    state: candidate.state as "OUT" | "LOW",
    detail:
      candidate.state === "OUT"
        ? "закінчився"
        : `лишилось ${formatQuantityWithUnit(candidate.quantity, candidate.unit)}` +
          ` · мінімум ${formatQuantityWithUnit(candidate.minQty, candidate.unit)}`,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Покупки</h1>
        <p className="text-sm text-muted-foreground">
          Спільний список. Позначили куплене — воно одразу в запасах.
          Перетягніть товар, щоб перекласти його до іншої групи.
        </p>
      </div>

      <ShoppingList rows={listRows} candidates={suggestions} groups={groups} />
    </div>
  );
}
