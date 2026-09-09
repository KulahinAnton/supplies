import { Pressable, Text, View } from "react-native";
import type { ListRow } from "@/hooks/use-shopping-list";

/**
 * One line of the shared list.
 *
 * The **whole row is the checkbox**, not a small square beside the label. This
 * is used one-handed in a shop, often while holding something, and a 20pt
 * target next to a 300pt row is the wrong way round.
 *
 * A long press opens the row's actions rather than a trailing "…" button, for
 * the same reason: the gesture costs no width, and width is what a phone has
 * least of.
 */
export function RowItem({
  row,
  pending,
  onToggle,
  onActions,
}: {
  row: ListRow;
  pending: boolean;
  onToggle: () => void;
  onActions: () => void;
}) {
  /**
   * «додав Антон» until someone buys it, «купила Олена» afterwards — a shared
   * list needs both, so nobody buys the same thing twice on the way home.
   */
  const attribution = row.checkedBy
    ? `купив(ла) ${row.checkedBy}`
    : `додав(ла) ${row.addedBy}`;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: row.isChecked, disabled: pending }}
      accessibilityLabel={row.label}
      disabled={pending}
      onPress={onToggle}
      onLongPress={onActions}
      className={`flex-row items-center gap-3 py-2.5 active:opacity-60 ${
        pending ? "opacity-50" : ""
      }`}
    >
      <View
        className={`h-5 w-5 items-center justify-center rounded border ${
          row.isChecked ? "border-primary bg-primary" : "border-border bg-card"
        }`}
      >
        {row.isChecked ? (
          <Text className="text-xs font-bold text-primary-foreground">✓</Text>
        ) : null}
      </View>

      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className={`text-sm ${
            row.isChecked
              ? "text-muted-foreground line-through"
              : "font-medium text-foreground"
          }`}
        >
          {row.label}
        </Text>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {attribution}
          {row.note ? ` · ${row.note}` : ""}
          {row.archivedAt ? " · в архіві" : ""}
        </Text>
      </View>
    </Pressable>
  );
}
