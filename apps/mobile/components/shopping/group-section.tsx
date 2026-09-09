import { Pressable, Text, View } from "react-native";
import type { GroupedList } from "@supplies/core/shopping-groups";
import { Card, Divider } from "@/components/ui/card";
import { RowItem } from "@/components/shopping/row-item";
import type { ListRow } from "@/hooks/use-shopping-list";

/**
 * One group of the list, collapsible, with its archived rows behind a toggle.
 *
 * Feature 14.2 — ticked rows sink within their group but never leave it, so
 * the list you are reading in a shop does not reorder under you. That ordering
 * is `groupShoppingRows`'s, not this component's; all it does is render
 * `visible` then, if asked, `archived`.
 */
export function GroupSection({
  group,
  collapsed,
  showArchived,
  pending,
  onToggleCollapse,
  onToggleArchived,
  onToggleRow,
  onRowActions,
}: {
  group: GroupedList<ListRow>;
  collapsed: boolean;
  showArchived: boolean;
  pending: boolean;
  onToggleCollapse: () => void;
  onToggleArchived: () => void;
  onToggleRow: (row: ListRow) => void;
  onRowActions: (row: ListRow) => void;
}) {
  const shown = showArchived ? [...group.visible, ...group.archived] : group.visible;

  return (
    <Card
      title={group.name}
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          onPress={onToggleCollapse}
          className="flex-row items-center gap-2 px-1 py-0.5 active:opacity-60"
        >
          <Text className="text-xs text-muted-foreground">
            {group.openCount > 0 ? `${group.openCount} до покупки` : "усе куплено"}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {collapsed ? "▾" : "▴"}
          </Text>
        </Pressable>
      }
    >
      {collapsed ? null : (
        <View>
          {shown.length === 0 ? (
            <Text className="py-2 text-sm text-muted-foreground">Порожньо.</Text>
          ) : (
            shown.map((row, index) => (
              <View key={row.id}>
                {index > 0 ? <Divider /> : null}
                <RowItem
                  row={row}
                  pending={pending}
                  onToggle={() => onToggleRow(row)}
                  onActions={() => onRowActions(row)}
                />
              </View>
            ))
          )}

          {group.archived.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={onToggleArchived}
              className="pt-2 active:opacity-60"
            >
              <Text className="text-xs text-primary">
                {showArchived
                  ? "Сховати архів"
                  : `Показати архів · ${group.archived.length}`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </Card>
  );
}
