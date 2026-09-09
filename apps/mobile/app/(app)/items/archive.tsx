import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { formatQuantityWithUnit } from "@supplies/core/format";
import type { ArchivedItem } from "@supplies/core/contracts/items";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { Divider } from "@/components/ui/card";
import { EmptyNote, ErrorNote, Spinner } from "@/components/ui/feedback";
import { Screen } from "@/components/ui/screen";

/**
 * Feature 3 — archived items.
 *
 * They are hidden from every other screen, so this is the only way back:
 * without it, archiving would be indistinguishable from deleting. That is also
 * why the copy says the history is kept — the movements still reference the
 * item, and somebody deciding whether to archive needs to know that before
 * they do it rather than after.
 */
export default function ItemsArchiveScreen() {
  const archived = useQuery({
    queryKey: keys.archive,
    queryFn: () => api.get<ArchivedItem[]>("/api/items/archive"),
  });

  const rows = archived.data ?? [];

  return (
    <Screen edges={["left", "right"]}>
      <Text className="text-sm text-muted-foreground">
        Ці товари приховані зі списків і нагадувань. Історія збережена.
      </Text>

      <ErrorNote error={archived.error} />

      {archived.isPending ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyNote>Архів порожній.</EmptyNote>
      ) : (
        <View className="rounded-lg border border-border bg-card px-3">
          {rows.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <Divider /> : null}
              <Link
                href={{ pathname: "/items/[id]", params: { id: item.id } }}
                asChild
              >
                <Pressable className="flex-row items-center justify-between gap-3 py-3 active:opacity-60">
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                      {item.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {item.categoryName}
                    </Text>
                  </View>
                  <Text className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {formatQuantityWithUnit(item.quantity, item.unit)}
                  </Text>
                </Pressable>
              </Link>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
