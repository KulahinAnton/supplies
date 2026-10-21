import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { formatDateTime, formatQuantityWithUnit } from "@supplies/core/format";
import type { MovementReason } from "@supplies/core/units";
import type { Movement } from "@supplies/core/contracts/dashboard";

/**
 * «Останні дії» — who did what.
 *
 * The verbs are here rather than in `@supplies/core/messages` because they are
 * UI copy in a component, which is the rule for anything rendered by React
 * (PROJECT_PROMPT.md §8); the catalogue is for strings produced outside it.
 * The same four words appear in `apps/spa` and `apps/web` for the same reason.
 */
const REASON_LABEL: Record<MovementReason, string> = {
  PURCHASE: "додав",
  CONSUME: "взяв",
  WASTE: "викинув",
  CORRECTION: "виправив",
};

export function MovementRow({ movement }: { movement: Movement }) {
  return (
    <Link
      href={{ pathname: "/items/[id]", params: { id: movement.item.id } }}
      asChild
    >
      <Pressable className="flex-row items-center justify-between gap-3 py-2.5 active:opacity-60">
        <View className="min-w-0 flex-1">
          <Text numberOfLines={2} className="text-sm text-foreground">
            <Text className="font-medium">{movement.user.name}</Text>{" "}
            <Text className="text-muted-foreground">
              {REASON_LABEL[movement.reason]}
            </Text>{" "}
            {movement.item.name}
          </Text>
        </View>
        <View className="shrink-0 items-end">
          <Text className="text-sm tabular-nums text-foreground">
            {formatQuantityWithUnit(movement.delta, movement.item.unit)}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {formatDateTime(new Date(movement.occurredAt))}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}
