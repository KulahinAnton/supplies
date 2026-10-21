import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { splitExpiring } from "@supplies/core/expiry";
import { todayUTC } from "@supplies/core/period";
import type { Dashboard } from "@supplies/core/contracts/dashboard";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { Card, Divider } from "@/components/ui/card";
import { EmptyNote, ErrorNote, Spinner } from "@/components/ui/feedback";
import { Screen } from "@/components/ui/screen";
import { ExpirySection } from "@/components/dashboard/expiry-section";
import { MovementRow } from "@/components/dashboard/movement-row";
import { RestockRow } from "@/components/dashboard/restock-row";

/**
 * «Огляд» — the phone's counterpart of `apps/web/app/(app)/dashboard/page.tsx`
 * and `apps/spa/src/routes/dashboard.tsx`.
 *
 * Three cards stacked rather than the web's two-column grid, because a phone
 * has one column and pretending otherwise is how a native app ends up feeling
 * like a shrunk website. The order is the order of urgency: what is going off,
 * what has run out, what happened.
 *
 * Everything it decides, it decides with the engine — `splitExpiring` for
 * Feature 30's two halves, `formatQuantityWithUnit` for every number. A filter
 * written inline here would be a second implementation of a rule in the one
 * layer nobody is watching, which is the mistake the SPA made and had to undo.
 */
export default function DashboardScreen() {
  const router = useRouter();
  const dashboard = useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api.get<Dashboard>("/api/dashboard"),
  });

  if (dashboard.isPending) return <Screen><Spinner /></Screen>;
  if (dashboard.isError) {
    return (
      <Screen>
        <ErrorNote error={dashboard.error} />
      </Screen>
    );
  }
  if (!dashboard.data) return null;

  const { expiryWarnDays, hasCategoryOverrides, expiring, restock, recent } =
    dashboard.data;
  const today = todayUTC();
  // Feature 30 — `expiring` arrives sorted by urgency; the split keeps that
  // order inside each half.
  const { expired, soon } = splitExpiring(expiring);

  return (
    <Screen>
      <View>
        <Text className="text-2xl font-semibold text-foreground">Огляд</Text>
        <Text className="text-sm text-muted-foreground">
          Що псується і що закінчується — станом на сьогодні.
        </Text>
      </View>

      {/*
        Feature 13 — the number in the caption is the household default. Once a
        category overrides it, saying it plainly would be a lie, so the caption
        admits that some categories differ.
      */}
      <Card
        title="Псується"
        caption={`попередження за ${expiryWarnDays} дн.${
          hasCategoryOverrides ? " (деякі категорії — інакше)" : ""
        }`}
      >
        {expiring.length === 0 ? (
          <EmptyNote>Нічого не псується найближчим часом.</EmptyNote>
        ) : (
          <View className="gap-4">
            {/*
              Two sections, because the halves call for opposite actions: bin
              the first, eat the second. Expired goes on top; it is the half
              with nothing left to decide.
            */}
            <ExpirySection
              title="Прострочено"
              tone="destructive"
              items={expired}
              today={today}
            />
            <ExpirySection
              title="Спожити найближчим часом"
              tone="warning"
              items={soon}
              today={today}
            />
          </View>
        )}
      </Card>

      <Card
        title="Закінчується"
        action={
          restock.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/shopping")}
              className="px-1 py-0.5 active:opacity-60"
            >
              <Text className="text-xs text-primary">до списку</Text>
            </Pressable>
          ) : undefined
        }
      >
        {restock.length === 0 ? (
          <EmptyNote>Усе на місці.</EmptyNote>
        ) : (
          <View>
            {restock.map((entry, index) => (
              <View key={`${entry.kind}:${entry.id}`}>
                {index > 0 ? <Divider /> : null}
                <RestockRow entry={entry} />
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card title="Останні дії">
        {recent.length === 0 ? (
          <EmptyNote>Поки нічого не відбувалося.</EmptyNote>
        ) : (
          <View>
            {recent.map((movement, index) => (
              <View key={movement.id}>
                {index > 0 ? <Divider /> : null}
                <MovementRow movement={movement} />
              </View>
            ))}
          </View>
        )}
      </Card>
    </Screen>
  );
}
