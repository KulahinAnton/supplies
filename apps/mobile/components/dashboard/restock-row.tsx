import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { toDecimal } from "@supplies/core/decimal";
import { formatQuantityWithUnit } from "@supplies/core/format";
import type { RestockEntry } from "@supplies/core/contracts/dashboard";
import { StockBadge } from "@/components/ui/state-badges";

/**
 * One line of «Закінчується» — an item, or a Feature 26 set counted as one.
 *
 * A set is **not** a link. It has no detail screen of any kind, and the SPA
 * shipped a version that linked to `/items/<group id>`, which is not a page.
 * Here the difference is structural rather than remembered: the row body is
 * built once and only the item branch wraps it in a `Link`.
 */
export function RestockRow({ entry }: { entry: RestockEntry }) {
  const body = (
    <View className="flex-row items-center justify-between gap-3 py-2.5">
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-medium text-foreground">
          {entry.name}
          {/* Feature 26 — say it is a set, or «0» reads as one product. */}
          {entry.kind === "group" ? (
            <Text className="text-xs font-normal text-muted-foreground">
              {"  "}набір · {entry.memberCount}
            </Text>
          ) : null}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {entry.unit ? formatQuantityWithUnit(entry.quantity, entry.unit) : "—"}
          {/*
            `toDecimal`, not `Number(...) > 0`. A quantity is a `Decimal(12,3)`
            that arrives as a string because JSON has no decimal type, and the
            house rule is that it goes back through the engine's own type
            rather than through a float — even for a comparison this forgiving.
          */}
          {toDecimal(entry.minQty).greaterThan(0) && entry.unit
            ? ` · мінімум ${formatQuantityWithUnit(entry.minQty, entry.unit)}`
            : null}
        </Text>
      </View>
      <StockBadge state={entry.state} />
    </View>
  );

  if (entry.kind === "group") return body;

  return (
    <Link href={{ pathname: "/items/[id]", params: { id: entry.id } }} asChild>
      <Pressable className="active:opacity-60">{body}</Pressable>
    </Link>
  );
}
