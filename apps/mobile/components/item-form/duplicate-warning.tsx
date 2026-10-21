import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { NamedItem } from "@supplies/core/duplicates";

/**
 * Feature 16.1 — warn while typing, never block.
 *
 * Most duplicates exist because somebody could not find the item they already
 * had, so the warning links to the matches: the useful action is almost always
 * "go top that one up", not "do not create this". Blocking would be wrong —
 * two genuinely different products can have similar names, and the person
 * holding both knows better than the matcher does.
 */
export function DuplicateWarning({ matches }: { matches: NamedItem[] }) {
  if (matches.length === 0) return null;

  return (
    <View className="gap-1 rounded-lg bg-warning/10 px-3 py-2.5">
      <Text className="text-sm text-warning-foreground">
        {matches.length === 1
          ? "Схоже, такий товар уже є:"
          : "Схоже, такі товари вже є:"}
      </Text>
      {matches.slice(0, 3).map((match) => (
        <Link
          key={match.id}
          href={{ pathname: "/items/[id]", params: { id: match.id } }}
          asChild
        >
          <Pressable className="active:opacity-60">
            <Text className="text-sm text-primary underline">{match.name}</Text>
          </Pressable>
        </Link>
      ))}
      <Text className="text-xs text-muted-foreground">
        Якщо це той самий товар — краще поповнити його запас.
      </Text>
    </View>
  );
}
