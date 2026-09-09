import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { toDecimal } from "@supplies/core/decimal";
import type { ItemView } from "@supplies/core/contracts/items";
import { formatQuantityWithUnit } from "@supplies/core/format";
import { ExpiryBadge, StockBadge } from "@/components/ui/state-badges";

/**
 * One row of «Запаси».
 *
 * The whole row is the touch target, not the name — a 44pt tap area is the
 * platform minimum and a text-sized link would miss it. The quantity sits
 * right-aligned and tabular so a column of them lines up while scrolling.
 */
export function ItemRow({ item, today }: { item: ItemView; today: Date }) {
  /**
   * The Next page formats this server-side, where `minQty` is still a Decimal.
   * Over HTTP it is a string, so the same two decisions — is it set, and how
   * does it read — happen here instead.
   */
  const minQtyLabel = toDecimal(item.minQty).greaterThan(0)
    ? formatQuantityWithUnit(item.minQty, item.unit)
    : null;

  /**
   * The object form, not a template string. `typedRoutes` types a dynamic
   * segment as the literal `/items/[id]`, so an interpolated id does not match
   * it — and that is the point: the id travels as a param rather than being
   * pasted into a path, which is what makes it impossible to forget to encode
   * one.
   */
  return (
    <Link href={{ pathname: "/items/[id]", params: { id: item.id } }} asChild>
      <Pressable className="flex-row items-center gap-3 border-b border-border px-5 py-3.5 active:bg-muted">
        <View className="min-w-0 flex-1 gap-1">
          <Text numberOfLines={1} className="text-base font-medium text-foreground">
            {item.name}
          </Text>
          <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {item.categoryName}
            {item.locationName ? ` · ${item.locationName}` : ""}
            {minQtyLabel ? ` · мінімум ${minQtyLabel}` : ""}
          </Text>
          <View className="flex-row flex-wrap items-center gap-1.5 pt-0.5">
            {/*
              Feature 26.1 — a grouped item's own minimum is ignored and it
              never appears in reminders on its own. Without saying so, an item
              at zero and silently absent from the shopping list looks broken.
            */}
            {item.groupName ? (
              <View className="rounded-full border border-border bg-muted px-2 py-0.5">
                <Text className="text-xs font-medium text-muted-foreground">
                  {item.groupName}
                </Text>
              </View>
            ) : null}
            <StockBadge state={item.stock} />
            <ExpiryBadge
              state={item.expiry}
              date={item.nextExpiry ? new Date(item.nextExpiry) : null}
              today={today}
            />
          </View>
        </View>
        <Text className="shrink-0 text-right text-sm font-semibold text-foreground">
          {formatQuantityWithUnit(item.quantity, item.unit)}
        </Text>
      </Pressable>
    </Link>
  );
}
