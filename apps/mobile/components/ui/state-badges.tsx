import { Text, View } from "react-native";
import type { ExpiryState } from "@supplies/core/expiry";
import { formatExpiryLabel } from "@supplies/core/format";
import type { StockState } from "@supplies/core/stock";

/**
 * The two state chips, rebuilt for React Native.
 *
 * The web version lives in `packages/ui/src/state-badges.tsx` and cannot be
 * shared — it renders `<span>` with Tailwind class strings resolved by a
 * browser. What IS shared is everything that decides what to say: the states
 * come from the engine, and `formatExpiryLabel` writes the sentence.
 *
 * Two chips, never one (§3.4/§3.5). An item can be well stocked AND
 * half-expired, and collapsing that hides whichever half is worse.
 */
const STOCK_LABEL: Record<StockState, string> = {
  OUT: "Закінчився",
  LOW: "Закінчується",
  OK: "Вистачає",
};

const STOCK_TONE: Record<StockState, string> = {
  OUT: "border-destructive/25 bg-destructive/10",
  LOW: "border-warning/30 bg-warning/15",
  OK: "border-success/25 bg-success/10",
};

const STOCK_TEXT: Record<StockState, string> = {
  OUT: "text-destructive",
  LOW: "text-warning",
  OK: "text-success",
};

export function StockBadge({ state }: { state: StockState }) {
  return (
    <View className={`rounded-full border px-2 py-0.5 ${STOCK_TONE[state]}`}>
      <Text className={`text-xs font-medium ${STOCK_TEXT[state]}`}>
        {STOCK_LABEL[state]}
      </Text>
    </View>
  );
}

const EXPIRY_TONE: Record<ExpiryState, string> = {
  EXPIRED: "border-destructive/25 bg-destructive/10",
  SOON: "border-warning/30 bg-warning/15",
  FRESH: "border-border bg-muted",
  NONE: "border-border bg-muted",
};

const EXPIRY_TEXT: Record<ExpiryState, string> = {
  EXPIRED: "text-destructive",
  SOON: "text-warning",
  FRESH: "text-muted-foreground",
  NONE: "text-muted-foreground",
};

export function ExpiryBadge({
  state,
  date,
  today,
}: {
  state: ExpiryState;
  date: Date | null;
  today: Date;
}) {
  if (state === "NONE" || !date) return null;

  // The phrase names its own state, so there is no prefix here to disagree
  // with `state`. Only the capital is ours.
  const phrase = formatExpiryLabel(date, today);
  const label = phrase.charAt(0).toUpperCase() + phrase.slice(1);

  return (
    <View className={`rounded-full border px-2 py-0.5 ${EXPIRY_TONE[state]}`}>
      <Text className={`text-xs font-medium ${EXPIRY_TEXT[state]}`}>{label}</Text>
    </View>
  );
}
