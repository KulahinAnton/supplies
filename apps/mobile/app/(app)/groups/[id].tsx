import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { formatQuantityWithUnit, UNIT_SHORT } from "@supplies/core/format";
import type { GroupDetail } from "@supplies/core/contracts/settings";
import { api } from "@/lib/api/client";
import { keys, stockWriteInvalidates } from "@/lib/api/keys";
import { Divider } from "@/components/ui/card";
import { EmptyNote, ErrorNote, Spinner } from "@/components/ui/feedback";
import { Screen } from "@/components/ui/screen";
import { StockBadge } from "@/components/ui/state-badges";

/**
 * One set, and what is in it.
 *
 * Feature 26.2 — the membership editor deliberately **cannot create items**. A
 * set is a way of counting things the household already tracks; letting it
 * mint new ones would put a second, thinner item form in front of the reader
 * and produce items with no category, no location and no stock.
 *
 * `compatible` is decided by the SERVER — Feature 26's one-unit rule, which an
 * empty set waives. Every candidate is listed, including the ones that cannot
 * join, with the reason: hiding an item somebody is looking for is worse than
 * showing it greyed, and deciding it here would be a second copy of the rule.
 */
export default function GroupDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");

  const detail = useQuery({
    queryKey: keys.group(id),
    queryFn: () => api.get<GroupDetail>(`/api/groups/${id}`),
    enabled: Boolean(id),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: keys.group(id) });
    void queryClient.invalidateQueries({ queryKey: keys.groups });
    // Membership changes which minimum applies to an item, so it changes the
    // restock list and the badges — Feature 26.1.
    for (const key of stockWriteInvalidates) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const add = useMutation({
    mutationFn: (itemId: string) =>
      api.post(`/api/settings/groups/${id}/items`, { itemId }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (itemId: string) => api.del(`/api/settings/groups/items/${itemId}`),
    onSuccess: invalidate,
  });

  const candidates = useMemo(() => {
    const all = detail.data?.candidates ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return all.slice(0, 20);
    return all.filter((one) => one.name.toLowerCase().includes(needle)).slice(0, 20);
  }, [detail.data?.candidates, query]);

  if (detail.isPending) {
    return (
      <Screen edges={["left", "right"]}>
        <Spinner />
      </Screen>
    );
  }
  if (!detail.data) {
    return (
      <Screen edges={["left", "right"]}>
        <ErrorNote error={detail.error} />
      </Screen>
    );
  }

  const { group, view, members } = detail.data;
  const busy = add.isPending || remove.isPending;

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen options={{ title: group.name }} />

      <View className="gap-2 rounded-lg border border-border bg-card p-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-base font-semibold text-foreground">{group.name}</Text>
          <StockBadge state={view.state} />
        </View>
        <Text className="text-sm text-muted-foreground">
          {view.unit
            ? `Разом ${formatQuantityWithUnit(view.quantity, view.unit)} · мінімум ${formatQuantityWithUnit(group.minQty, view.unit)}`
            : `Мінімум ${group.minQty} — одиниця з'явиться з першим товаром.`}
        </Text>
      </View>

      <View className="gap-2">
        <Text className="text-base font-semibold text-foreground">
          У наборі ({members.length})
        </Text>
        {members.length === 0 ? (
          <EmptyNote>Поки порожньо.</EmptyNote>
        ) : (
          <View className="rounded-lg border border-border bg-card px-4">
            {members.map((member, index) => (
              <View key={member.id}>
                {index > 0 ? <Divider /> : null}
                <View className="flex-row items-center gap-3 py-3">
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-base text-foreground">
                      {member.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {formatQuantityWithUnit(member.quantity, member.unit)}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Прибрати ${member.name}`}
                    disabled={busy}
                    onPress={() => remove.mutate(member.id)}
                    className="h-10 w-10 items-center justify-center rounded-lg border border-border active:opacity-60"
                  >
                    <Text className="text-sm text-foreground">✕</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="gap-2">
        <Text className="text-base font-semibold text-foreground">Додати товар</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Пошук за назвою…"
          placeholderTextColor="#6b7069"
          autoCapitalize="none"
          className="rounded-lg border border-border bg-card px-3 py-2.5 text-base text-foreground"
        />
        {candidates.length === 0 ? (
          <EmptyNote>Нічого не знайшли.</EmptyNote>
        ) : (
          <View className="rounded-lg border border-border bg-card px-4">
            {candidates.map((candidate, index) => (
              <View key={candidate.id}>
                {index > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Додати ${candidate.name}`}
                  disabled={busy || !candidate.compatible}
                  onPress={() => add.mutate(candidate.id)}
                  className={`flex-row items-center gap-3 py-3 ${
                    candidate.compatible ? "active:opacity-60" : "opacity-50"
                  }`}
                >
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-base text-foreground">
                      {candidate.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {UNIT_SHORT[candidate.unit]}
                      {candidate.currentGroupName
                        ? ` · зараз у «${candidate.currentGroupName}»`
                        : ""}
                      {candidate.compatible ? "" : " · інша одиниця"}
                    </Text>
                  </View>
                  <Text className="text-base text-primary">
                    {candidate.compatible ? "+" : "—"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
