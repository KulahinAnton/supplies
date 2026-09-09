import type { ReactNode } from "react";
import { Text, View } from "react-native";

/**
 * The bordered block every dashboard-shaped screen is made of.
 *
 * `@supplies/ui`'s `Card` is web-only (SPA_API_PORT.md §4.3), so this is the
 * same idea rebuilt with the same tokens rather than a missed reuse. It stays
 * one component with two optional slots: a card that needed a `CardFooter`
 * would be a screen section pretending to be a card.
 *
 * `caption` and `action` are mutually exclusive in practice but not in type,
 * because the header is a row and both simply sit at its right — the web
 * version does the same, and enforcing the exclusion would buy nothing.
 */
export function Card({
  title,
  caption,
  action,
  children,
}: {
  title: string;
  caption?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View className="gap-3 rounded-lg border border-border bg-card p-4">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-base font-semibold text-foreground">{title}</Text>
        {caption ? (
          <Text className="shrink text-right text-xs text-muted-foreground">
            {caption}
          </Text>
        ) : null}
        {action}
      </View>
      {children}
    </View>
  );
}

/**
 * A hairline between rows.
 *
 * Web writes `divide-y` on the list and gets this for free. React Native has
 * no sibling selectors, so the separator is a component and the row that
 * renders it decides — which is why lists here render it *before* every row
 * but the first rather than after every row but the last.
 */
export function Divider() {
  return <View className="h-px bg-border" />;
}
