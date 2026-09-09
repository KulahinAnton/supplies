import { useState } from "react";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { ErrorNote, Spinner } from "@/components/ui/feedback";
import { CandidatesCard } from "@/components/shopping/candidates-card";
import { GroupSection } from "@/components/shopping/group-section";
import { QuickAdd } from "@/components/shopping/quick-add";
import { useShoppingList, type ListRow } from "@/hooks/use-shopping-list";

/**
 * «Покупки» — the counterpart of `apps/spa/src/routes/shopping.tsx` and
 * `apps/web/app/(app)/shopping/page.tsx`.
 *
 * What this file knows is *where things go*. The data, the writes and the
 * grouping are `useShoppingList`; each visible part is its own component.
 *
 * **Two deliberate differences from the web clients.**
 *
 * The web list is drag-and-drop between groups. A phone gets a long press and
 * a sheet instead — a drag that competes with a vertical scroll is a gesture
 * people trigger by accident, and Feature 11's own note says the collision
 * strategy is the hard part. Same operation, an interaction the platform
 * already teaches.
 *
 * Collapsed groups and "show archived" are per-screen rather than remembered.
 * `packages/ui`'s hooks store them in `localStorage`, which does not exist
 * here, and a persisted preference is not worth a storage dependency until
 * somebody misses it.
 */
export default function ShoppingScreen() {
  const router = useRouter();
  const list = useShoppingList();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [archivedShown, setArchivedShown] = useState<string[]>([]);

  function toggle(ids: string[], id: string) {
    return ids.includes(id) ? ids.filter((one) => one !== id) : [...ids, id];
  }

  function onToggleRow(row: ListRow) {
    if (row.isChecked) {
      list.run(() => api.post(`/api/shopping/${row.id}/uncheck`));
      return;
    }
    /**
     * Feature 6 — ticking a row that names a real item is a stock write, and
     * the quantity and expiry belong to the person who just carried it home.
     * A one-off like «свічки» has no stock to update, so it never reaches the
     * sheet: the tick is the whole interaction.
     */
    if (!row.itemId) {
      list.run(() => api.post(`/api/shopping/${row.id}/check`));
      return;
    }
    router.push({ pathname: "/shopping-check", params: { id: row.id } });
  }

  if (list.status === "pending") {
    return (
      <SafeAreaView edges={["top", "left", "right"]} className="flex-1 bg-background">
        <Spinner />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-5 p-5 pb-10"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl refreshing={list.refreshing} onRefresh={list.refetch} />
        }
      >
        <View>
          <Text className="text-2xl font-semibold text-foreground">Покупки</Text>
          <Text className="text-sm text-muted-foreground">
            Спільний список. Позначили куплене — воно одразу в запасах.
          </Text>
        </View>

        {list.status === "error" ? <ErrorNote error={list.error} /> : null}
        {list.refusal ? (
          <View className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
            <Text className="text-sm text-destructive">{list.refusal}</Text>
          </View>
        ) : null}

        <QuickAdd
          pending={list.pending}
          onAdd={(text) => list.run(() => api.post("/api/shopping", { freeText: text }))}
        />

        <CandidatesCard
          candidates={list.candidates}
          pending={list.pending}
          onAdd={(candidate) =>
            list.run(() =>
              api.post(
                "/api/shopping",
                candidate.itemId
                  ? { itemId: candidate.itemId }
                  : { freeText: candidate.name },
              ),
            )
          }
        />

        {list.grouped.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            collapsed={collapsed.includes(group.id)}
            showArchived={archivedShown.includes(group.id)}
            pending={list.pending}
            onToggleCollapse={() => setCollapsed((ids) => toggle(ids, group.id))}
            onToggleArchived={() => setArchivedShown((ids) => toggle(ids, group.id))}
            onToggleRow={onToggleRow}
            onRowActions={(row) =>
              router.push({ pathname: "/shopping-row", params: { id: row.id } })
            }
          />
        ))}

        {/*
          Feature 14.2 — archiving the ticked rows is how the list is emptied
          without losing what was bought. It sits at the bottom because it is
          the end of a shopping trip, not the start of one.
        */}
        {list.checkedCount > 0 ? (
          <Button
            label={`Прибрати куплене · ${list.checkedCount}`}
            variant="ghost"
            disabled={list.pending}
            onPress={() => list.run(() => api.post("/api/shopping/archive-checked"))}
          />
        ) : null}

        <Text className="text-center text-xs text-muted-foreground">
          {list.openCount > 0 ? `Ще купити: ${list.openCount}` : "Усе куплено."}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
