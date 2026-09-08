import { useQuery } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { toDecimal } from "@supplies/core/decimal";
import { formatQuantityWithUnit, formatQuantityWithUnitLong } from "@supplies/core/format";
import { itemExpiryState } from "@supplies/core/expiry";
import { todayUTC } from "@supplies/core/period";
import { fefoOrder, itemQuantity, stockState, type StockBatchInput } from "@supplies/core/stock";
import { apiUrl, health, ready } from "../lib/api";

/**
 * Phase 3.1 — the scaffold's proof of life, and deliberately not a
 * hello-world.
 *
 * Two things have to be true before any screen is worth building, and this
 * asserts both:
 *
 * 1. **The engine runs in a Metro bundle.** Everything below the divider is
 *    computed by `@supplies/core` — the same functions the Next app, the SPA,
 *    the API and the Telegram bot call — from a package that lives outside
 *    this app's directory and is reached through pnpm symlinks. If
 *    `metro.config.js` is wrong, this screen does not render at all, which is
 *    exactly the feedback Phase 3.1 wants. It is also the payoff for Phase 0:
 *    the engine no longer imports `Prisma.Decimal`, so no Node builtin comes
 *    with it.
 * 2. **The phone can reach the API.** On an Android emulator `localhost` is
 *    the emulator itself, not the machine running the API — `lib/api.ts` has
 *    the whole story. Getting that wrong looks identical to a dead server, so
 *    it is worth its own line on screen.
 *
 * The worked example is PROJECT_PROMPT.md §3.6, the one
 * `packages/core/src/stock.test.ts` reproduces verbatim. Same inputs, same
 * expected answers, running on a phone.
 */

const today = todayUTC();

/** §3.6 — 10 bottles of water across three expiry dates, one already gone. */
const BATCHES: StockBatchInput[] = [
  {
    id: "expired",
    quantity: toDecimal("2"),
    expiresAt: new Date(Date.UTC(2020, 0, 1)),
    createdAt: new Date(Date.UTC(2019, 11, 1)),
  },
  {
    id: "soonest",
    quantity: toDecimal("1"),
    expiresAt: new Date(Date.UTC(2030, 5, 1)),
    createdAt: new Date(Date.UTC(2025, 0, 5)),
  },
  {
    id: "later",
    quantity: toDecimal("7"),
    expiresAt: new Date(Date.UTC(2031, 0, 1)),
    createdAt: new Date(Date.UTC(2025, 0, 1)),
  },
  {
    id: "undated",
    quantity: toDecimal("3"),
    expiresAt: null,
    createdAt: new Date(Date.UTC(2024, 0, 1)),
  },
];

export default function StatusScreen() {
  const api = useQuery({ queryKey: ["health"], queryFn: health, retry: false });
  const db = useQuery({ queryKey: ["ready"], queryFn: ready, retry: false });

  const total = itemQuantity(BATCHES);
  const state = stockState({ minQty: toDecimal("4"), unit: "PIECE" }, BATCHES);
  const expiry = itemExpiryState(BATCHES, today, 7);
  const draw = fefoOrder(BATCHES, today);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-6 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-semibold text-foreground">Запаси</Text>
          <Text className="text-sm text-muted-foreground">
            Перевірка збірки — Phase 3.1
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-base font-semibold text-foreground">API</Text>
          <Text className="text-xs text-muted-foreground">{apiUrl()}</Text>
          <Row
            label="Процес"
            value={
              api.isPending ? "…" : api.isError ? "недоступний" : `працює (${api.data?.uptime} с)`
            }
            ok={api.isSuccess}
          />
          <Row
            label="База даних"
            value={db.isPending ? "…" : db.data?.database ? "підключена" : "недоступна"}
            ok={db.data?.database === true}
          />
        </View>

        <View className="h-px bg-border" />

        <View className="gap-2">
          <Text className="text-base font-semibold text-foreground">
            Рушій у Metro-бандлі
          </Text>
          <Text className="text-xs text-muted-foreground">
            Приклад §3.6, порахований @supplies/core просто тут, на телефоні.
          </Text>
          <Row label="Всього" value={formatQuantityWithUnit(total.toString(), "PIECE")} ok />
          <Row label="Довга форма" value={formatQuantityWithUnitLong(total.toString(), "PIECE")} ok />
          <Row label="Запас (мінімум 4)" value={state} ok={state === "OK"} />
          <Row label="Придатність" value={expiry} ok={expiry !== "EXPIRED"} />
          <Row
            label="Порядок FEFO"
            value={draw.map((batch) => batch.id).join(" → ")}
            // §3.3 — the expired batch is skipped entirely, so it must not be
            // in this list. Seeing it here would mean the phone disagrees with
            // the server about which stock gets used.
            ok={!draw.some((batch) => batch.id === "expired")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className={ok ? "text-sm font-medium text-primary" : "text-sm font-medium text-destructive"}>
        {value}
      </Text>
    </View>
  );
}
