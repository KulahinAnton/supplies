import { useRouter } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { todayUTC } from "@supplies/core/period";
import type { ItemView } from "@supplies/core/contracts/items";
import { EmptyNote, ErrorNote, Spinner } from "@/components/ui/feedback";
import { ItemFilters } from "@/components/items/item-filters";
import { ItemRow } from "@/components/items/item-row";
import { useItemList } from "@/hooks/use-item-list";

/**
 * «Запаси» — Milestone A's list, and the counterpart of
 * `apps/web/app/(app)/items/page.tsx` and `apps/spa/src/routes/items.tsx`.
 *
 * **`FlatList`, not a `ScrollView` of rows and not `@expo/ui`'s `List`.** That
 * one renders native grouped rows — an iOS Settings screen — and is explicitly
 * not virtualized; a household with two hundred items would mount two hundred
 * views. `FlatList` recycles them.
 *
 * The header travels in `ListHeaderComponent` rather than sitting above the
 * list, so the search field scrolls away with the content instead of eating a
 * fifth of a phone screen permanently.
 */
export default function ItemsScreen() {
  const { query, setQuery, filter, setFilter, items } = useItemList();
  const router = useRouter();
  const today = todayUTC();

  const rows = items.data?.rows ?? [];

  return (
    <SafeAreaView edges={["left", "right"]} className="flex-1 bg-background">
      <FlatList
        data={rows}
        keyExtractor={(item: ItemView) => item.id}
        renderItem={({ item }) => <ItemRow item={item} today={today} />}
        // Dismisses the keyboard as the list moves, the way every native list
        // does — typing then scrolling should not need a second gesture.
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <ItemFilters
              query={query}
              onQuery={setQuery}
              filter={filter}
              onFilter={setFilter}
            />
            <ErrorNote error={items.error} />
          </View>
        }
        ListEmptyComponent={
          items.isPending ? (
            <Spinner />
          ) : (
            <View className="px-5">
              <EmptyNote>
                {query.trim() ? "Нічого не знайшли." : "Тут поки порожньо."}
              </EmptyNote>
            </View>
          )
        }
        ListFooterComponent={
          items.data ? (
            <View className="items-center gap-3 py-6">
              <Text className="text-xs text-muted-foreground">
                {items.data.total > 0 ? `${items.data.total} позицій` : ""}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/status")}
                className="px-3 py-1"
              >
                <Text className="text-xs text-muted-foreground underline">
                  Стан збірки
                </Text>
              </Pressable>
            </View>
          ) : null
        }
        // Pull to refresh: the gesture people already expect, and the only way
        // to force a reload of a cache that is otherwise 30 seconds stale.
        refreshing={items.isRefetching}
        onRefresh={() => void items.refetch()}
      />
    </SafeAreaView>
  );
}
