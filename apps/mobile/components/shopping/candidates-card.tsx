import { Pressable, Text, View } from "react-native";
import { Card, Divider } from "@/components/ui/card";
import type { Candidate } from "@/hooks/use-shopping-list";

/**
 * Feature 6 — **a suggestion, never an insertion.**
 *
 * Nothing here is on the list yet. The whole card is the offer, and tapping a
 * row is the accept; an app that put low-stock items on the shopping list by
 * itself would be deciding what a family buys.
 *
 * It renders nothing at all when there is nothing to suggest, rather than an
 * empty card explaining what it would show — an empty state is worth the space
 * only where its absence is information, and here it is not.
 */
export function CandidatesCard({
  candidates,
  pending,
  onAdd,
}: {
  candidates: Candidate[];
  pending: boolean;
  onAdd: (candidate: Candidate) => void;
}) {
  if (candidates.length === 0) return null;

  return (
    <Card title="Варто купити" caption={`${candidates.length}`}>
      <View>
        {candidates.map((candidate, index) => (
          <View key={candidate.itemId ?? candidate.name}>
            {index > 0 ? <Divider /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Додати ${candidate.name}`}
              disabled={pending}
              onPress={() => onAdd(candidate)}
              className={`flex-row items-center justify-between gap-3 py-2.5 active:opacity-60 ${
                pending ? "opacity-50" : ""
              }`}
            >
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                  {candidate.name}
                </Text>
                <Text className="text-xs text-muted-foreground">{candidate.detail}</Text>
              </View>
              <Text className="text-sm font-medium text-primary">+</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </Card>
  );
}
