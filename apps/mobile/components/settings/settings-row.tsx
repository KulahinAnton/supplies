import { Pressable, Text, View } from "react-native";
import { Divider } from "@/components/ui/card";

/**
 * One line of the settings index — a label, a value, and a chevron.
 *
 * The web puts all eight panels on one page, which works with a mouse and a
 * wide screen. A phone gets an index instead: eight expanded panels stacked is
 * a wall to scroll past every time somebody wants the one at the bottom, and
 * the platform's own Settings answers the same problem the same way.
 */
export function SettingsRow({
  label,
  value,
  onPress,
  tone = "default",
}: {
  label: string;
  value?: string;
  onPress: () => void;
  tone?: "default" | "destructive";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 py-3.5 active:opacity-60"
    >
      <Text
        className={`flex-1 text-base ${
          tone === "destructive" ? "text-destructive" : "text-foreground"
        }`}
      >
        {label}
      </Text>
      {value ? (
        <Text numberOfLines={1} className="max-w-[45%] text-sm text-muted-foreground">
          {value}
        </Text>
      ) : null}
      <Text className="text-muted-foreground">›</Text>
    </Pressable>
  );
}

/** A titled block of rows, hairlines between them. */
export function SettingsGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  // A group of one is legitimate — «Рецепти» is its own section when the
  // household has the helper on — so this normalises rather than demanding an
  // array in the type.
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View className="gap-2">
      {title ? (
        <Text className="text-xs font-medium uppercase text-muted-foreground">
          {title}
        </Text>
      ) : null}
      <View className="rounded-lg border border-border bg-card px-4">
        {rows.map((row, index) => (
          <View key={index}>
            {index > 0 ? <Divider /> : null}
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}
