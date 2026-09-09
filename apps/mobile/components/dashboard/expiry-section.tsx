import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { formatQuantityWithUnit } from "@supplies/core/format";
import type { ItemView } from "@supplies/core/contracts/items";
import { Divider } from "@/components/ui/card";
import { ExpiryBadge } from "@/components/ui/state-badges";

/**
 * Feature 30 — one half of «Псується».
 *
 * Renders nothing when its half is empty, so a household with only expired
 * items sees one heading rather than an empty section explaining what it does
 * not have. The split itself is `splitExpiring` in the engine, not a filter
 * written here: the dashboard, the digest and the bot's `/expiring` all show
 * this list and have to agree about which half a thing is in.
 */
export function ExpirySection({
  title,
  tone,
  items,
  today,
}: {
  title: string;
  tone: "destructive" | "warning";
  items: ItemView[];
  today: Date;
}) {
  if (items.length === 0) return null;

  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-1.5">
        <Text
          className={`text-xs font-semibold ${
            tone === "destructive" ? "text-destructive" : "text-warning-foreground"
          }`}
        >
          {title}
        </Text>
        <Text className="text-xs text-muted-foreground">· {items.length}</Text>
      </View>

      {items.map((item, index) => (
        <View key={item.id}>
          {index > 0 ? <Divider /> : null}
          <Link href={{ pathname: "/items/[id]", params: { id: item.id } }} asChild>
            <Pressable className="flex-row items-center justify-between gap-3 py-2.5 active:opacity-60">
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                  {item.name}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {formatQuantityWithUnit(item.quantity, item.unit)}
                </Text>
              </View>
              <ExpiryBadge
                state={item.expiry}
                date={item.nextExpiry ? new Date(item.nextExpiry) : null}
                today={today}
              />
            </Pressable>
          </Link>
        </View>
      ))}
    </View>
  );
}
