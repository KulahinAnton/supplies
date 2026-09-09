import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { toDecimal } from "@supplies/core/decimal";
import { batchExpiryState } from "@supplies/core/expiry";
import {
  formatDate,
  formatDateTime,
  formatQuantityWithUnit,
} from "@supplies/core/format";
import { todayUTC } from "@supplies/core/period";
import { fefoOrder } from "@supplies/core/stock";
import type { MovementReason } from "@supplies/core/units";
import { Button } from "@/components/ui/button";
import { ErrorNote, Spinner } from "@/components/ui/feedback";
import { ExpiryBadge, StockBadge } from "@/components/ui/state-badges";
import { useItemDetail } from "@/hooks/use-item-detail";

const REASON_LABEL: Record<MovementReason, string> = {
  PURCHASE: "Поповнення",
  CONSUME: "Взяли",
  WASTE: "Списано",
  CORRECTION: "Виправлення",
};

/**
 * One item — Milestone A's detail screen.
 *
 * FEFO is not implemented here and must never be. «Взяли» sends a quantity and
 * the API's write path decides which batches it comes out of. The batch ORDER
 * on screen is `fefoOrder` from `@supplies/core` — the same function the server
 * calls — so the list shows the order stock will actually be drawn in rather
 * than a client's guess at it.
 */
export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { detail } = useItemDetail(id ?? "");
  const today = todayUTC();

  if (detail.isPending) {
    return (
      <SafeAreaView edges={["left", "right"]} className="flex-1 bg-background">
        <Spinner />
      </SafeAreaView>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <SafeAreaView edges={["left", "right"]} className="flex-1 bg-background">
        <View className="p-5">
          <ErrorNote error={detail.error} />
        </View>
      </SafeAreaView>
    );
  }

  const { item, warnDays, quantity, stock, expiry } = detail.data;

  /**
   * Revived for the engine: `fefoOrder` takes `Decimal` and `Date`, because on
   * the server it is handed Prisma rows. Reviving is the cheap half of that
   * bargain — the expensive half would be a second implementation of §3.3 that
   * agrees with the server until it does not.
   */
  const revived = item.batches.map((batch) => ({
    ...batch,
    quantity: toDecimal(batch.quantity),
    expiresAt: batch.expiresAt ? new Date(batch.expiresAt) : null,
    createdAt: new Date(batch.createdAt),
  }));
  const live = revived.filter((batch) => batch.quantity.greaterThan(0));
  const byId = new Map(live.map((batch) => [batch.id, batch]));
  const drawOrder = fefoOrder(live, today)
    .map((batch) => byId.get(batch.id))
    .filter((batch) => batch !== undefined);
  // Expired batches are excluded from FEFO entirely (§3.3) and must be
  // discarded explicitly — so they go last rather than vanishing.
  const expired = live.filter((batch) => !drawOrder.some((b) => b.id === batch.id));
  const ordered = [...drawOrder, ...expired];

  const minQty = toDecimal(item.minQty);

  return (
    <SafeAreaView edges={["left", "right"]} className="flex-1 bg-background">
      <Stack.Screen options={{ title: item.name }} />
      <ScrollView contentContainerClassName="gap-5 p-5 pb-10">
        <View className="gap-2">
          <Text className="text-2xl font-semibold text-foreground">{item.name}</Text>
          <Text className="text-sm text-muted-foreground">
            {item.category.name}
            {item.location ? ` · ${item.location.name}` : ""}
          </Text>
          <View className="flex-row flex-wrap gap-1.5 pt-1">
            <StockBadge state={stock} />
            <ExpiryBadge
              state={expiry}
              date={ordered[0]?.expiresAt ?? null}
              today={today}
            />
          </View>
        </View>

        <View className="items-center gap-1 rounded-lg border border-border bg-card py-6">
          <Text className="text-4xl font-semibold text-foreground">
            {formatQuantityWithUnit(quantity, item.unit)}
          </Text>
          {minQty.greaterThan(0) ? (
            <Text className="text-sm text-muted-foreground">
              мінімум {formatQuantityWithUnit(item.minQty, item.unit)}
            </Text>
          ) : null}
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              label="Взяли"
              onPress={() =>
                router.push({
                  pathname: "/stock-write",
                  params: { itemId: item.id, mode: "take" },
                })
              }
            />
          </View>
          <View className="flex-1">
            <Button
              label="Поповнити"
              variant="ghost"
              onPress={() =>
                router.push({
                  pathname: "/stock-write",
                  params: { itemId: item.id, mode: "add" },
                })
              }
            />
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-base font-semibold text-foreground">
            Партії ({ordered.length})
          </Text>
          <Text className="text-xs text-muted-foreground">
            У тому порядку, в якому їх візьмуть.
          </Text>
          {ordered.length === 0 ? (
            <Text className="text-sm text-muted-foreground">Порожньо.</Text>
          ) : (
            ordered.map((batch) => {
              const state = batchExpiryState(batch.expiresAt, today, warnDays);
              return (
                <View
                  key={batch.id}
                  className="flex-row items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                >
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="text-sm text-foreground">
                      {formatQuantityWithUnit(batch.quantity.toString(), item.unit)}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {batch.expiresAt ? `до ${formatDate(batch.expiresAt)}` : "без дати"}
                      {batch.location ? ` · ${batch.location.name}` : ""}
                    </Text>
                  </View>
                  <ExpiryBadge state={state} date={batch.expiresAt} today={today} />
                </View>
              );
            })
          )}
        </View>

        <View className="gap-2">
          <Text className="text-base font-semibold text-foreground">Історія</Text>
          {item.movements.length === 0 ? (
            <Text className="text-sm text-muted-foreground">Поки нічого.</Text>
          ) : (
            item.movements.slice(0, 20).map((movement) => (
              <View
                key={movement.id}
                className="flex-row items-center justify-between gap-3 border-b border-border py-2.5"
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-sm text-foreground">
                    {REASON_LABEL[movement.reason]} · {movement.user.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {formatDateTime(new Date(movement.occurredAt))}
                  </Text>
                </View>
                <Text className="text-sm text-muted-foreground">
                  {formatQuantityWithUnit(movement.delta, item.unit)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
