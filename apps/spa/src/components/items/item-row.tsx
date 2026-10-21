import { Boxes } from "lucide-react";
import { Link } from "react-router";
import { toDecimal } from "@supplies/core/decimal";
import { formatQuantityWithUnit } from "@supplies/core/format";
import { ExpiryBadge, StockBadge } from "@supplies/ui/state-badges";
import type { RevivedItemView } from "../../api/types";

/**
 * One row of «Запаси».
 *
 * The two state axes are two chips, never one (§3.4/§3.5): an item can be well
 * stocked *and* half-expired, and collapsing that would hide whichever half is
 * worse.
 */
export function ItemRow({ item, today }: { item: RevivedItemView; today: Date }) {
  /**
   * The Next page formats this server-side, where `minQty` is still a Decimal.
   * Over HTTP it is a string, so the same two decisions — is it set, and how
   * does it read — happen here instead.
   */
  const minQtyLabel = toDecimal(item.minQty).greaterThan(0)
    ? formatQuantityWithUnit(item.minQty, item.unit)
    : null;

  return (
    <li>
      <Link
        to={`/items/${item.id}`}
        className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-accent"
      >
        <div className="min-w-0 space-y-1">
          <div className="truncate font-medium">{item.name}</div>
          <div className="text-xs text-muted-foreground">
            {item.categoryName}
            {item.locationName ? ` · ${item.locationName}` : ""}
            {minQtyLabel ? ` · мінімум ${minQtyLabel}` : ""}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {/*
              Feature 26.1 — a grouped item's own minimum is ignored and it
              never appears in reminders on its own. Without saying so here, an
              item sitting at zero and silently absent from the shopping list
              looks like a bug.
            */}
            {item.groupName ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground">
                <Boxes className="size-3" />
                {item.groupName}
              </span>
            ) : null}
            <StockBadge state={item.stock} />
            <ExpiryBadge state={item.expiry} date={item.nextExpiry} today={today} />
          </div>
        </div>
        <div className="shrink-0 text-right text-sm font-semibold tabular-nums">
          {formatQuantityWithUnit(item.quantity, item.unit)}
        </div>
      </Link>
    </li>
  );
}
