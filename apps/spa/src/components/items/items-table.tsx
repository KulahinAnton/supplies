import { cn } from "@supplies/ui/utils";
import { reviveItemView, type ItemView } from "../../api/types";
import { ItemRow } from "./item-row";

/**
 * The rows, or the sentence that says why there are none.
 *
 * `stale` dims the list while a newer page is in flight, so rows held over by
 * `keepPreviousData` do not read as the answer to what was just typed. Holding
 * them at all is what stops the list flashing empty on every keystroke — the
 * thing a server-rendered page gets for free.
 */
export function ItemsTable({
  rows,
  today,
  stale,
}: {
  rows: ItemView[];
  today: Date;
  stale: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        Нічого не знайшли.
      </p>
    );
  }

  return (
    <ul className={cn("divide-y rounded-lg border transition-opacity", stale && "opacity-60")}>
      {rows.map(reviveItemView).map((item) => (
        <ItemRow key={item.id} item={item} today={today} />
      ))}
    </ul>
  );
}
