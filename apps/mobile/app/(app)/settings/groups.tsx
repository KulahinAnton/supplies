import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { formatQuantityWithUnit } from "@supplies/core/format";
import type { GroupView } from "@supplies/core/contracts/settings";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { Button } from "@/components/ui/button";
import { Divider } from "@/components/ui/card";
import { EmptyNote, Spinner } from "@/components/ui/feedback";
import { Screen } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { useWrite } from "@/hooks/use-settings-write";

/**
 * Feature 26 — sets of interchangeable items.
 *
 * The threshold lives here; **what is in the set lives on its own screen**,
 * which is where members are added and removed. One minimum for the set
 * instead of one per brand is the whole point, so the number is on the row and
 * the membership is one tap away rather than the other way round.
 */
export default function GroupsScreen() {
  const router = useRouter();
  const { write, refusal, pending } = useWrite();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");
  const [editedMin, setEditedMin] = useState("");

  const groups = useQuery({
    queryKey: keys.groups,
    queryFn: () => api.get<GroupView[]>("/api/groups"),
  });

  const rows = groups.data ?? [];

  return (
    <Screen edges={["left", "right"]}>
      <Text className="text-sm text-muted-foreground">
        Один мінімум на кілька взаємозамінних товарів — наприклад, молоко
        різних марок. Поки товар у наборі, його власний мінімум не діє.
      </Text>

      {refusal ? (
        <View className="rounded-lg bg-destructive/10 px-3 py-2.5">
          <Text className="text-sm text-destructive">{refusal}</Text>
        </View>
      ) : null}

      {groups.isPending ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyNote>Наборів ще немає.</EmptyNote>
      ) : (
        <View className="rounded-lg border border-border bg-card px-4">
          {rows.map((group, index) => (
            <View key={group.id}>
              {index > 0 ? <Divider /> : null}

              {editing === group.id ? (
                <View className="gap-3 py-3">
                  <TextField
                    label="Назва"
                    value={editedName}
                    onChangeText={setEditedName}
                    capitalize="sentences"
                  />
                  <TextField
                    label="Мінімум для набору"
                    value={editedMin}
                    onChangeText={setEditedMin}
                    keyboard="decimal-pad"
                  />
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Button
                        label="Зберегти"
                        disabled={pending || editedName.trim().length === 0}
                        onPress={() => {
                          void write(() =>
                            api.patch(`/api/settings/groups/${group.id}`, {
                              name: editedName.trim(),
                              minQty: editedMin.trim() || "0",
                            }),
                          );
                          setEditing(null);
                        }}
                      />
                    </View>
                    <View className="flex-1">
                      <Button
                        label="Скасувати"
                        variant="ghost"
                        onPress={() => setEditing(null)}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <View className="flex-row items-center gap-2 py-3">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Відкрити набір ${group.name}`}
                    onPress={() =>
                      router.push({
                        pathname: "/groups/[id]",
                        params: { id: group.id },
                      })
                    }
                    className="min-w-0 flex-1 active:opacity-60"
                  >
                    <Text numberOfLines={1} className="text-base text-foreground">
                      {group.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {/*
                        Feature 26.4 — how much, not only how many. An empty
                        set has no unit, so it has no total to state either.
                      */}
                      товарів: {group.memberCount}
                      {group.unit
                        ? ` · разом ${formatQuantityWithUnit(group.quantity, group.unit)} · мінімум ${formatQuantityWithUnit(group.minQty, group.unit)}`
                        : ""}
                    </Text>
                  </Pressable>

                  <Button
                    label="Змінити"
                    variant="ghost"
                    disabled={pending}
                    onPress={() => {
                      setEditing(group.id);
                      setEditedName(group.name);
                      setEditedMin(group.minQty);
                    }}
                  />
                  <Button
                    label="✕"
                    variant="ghost"
                    disabled={pending}
                    onPress={() =>
                      void write(() => api.del(`/api/settings/groups/${group.id}`))
                    }
                  />
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      <View className="gap-2">
        <TextField
          label="Додати набір"
          value={draft}
          onChangeText={setDraft}
          placeholder="Новий набір"
          capitalize="sentences"
        />
        <Button
          label="Додати"
          variant="ghost"
          disabled={pending || draft.trim().length === 0}
          onPress={() => {
            void write(() =>
              api.post("/api/settings/groups", { name: draft.trim(), minQty: "0" }),
            );
            setDraft("");
          }}
        />
      </View>
    </Screen>
  );
}
