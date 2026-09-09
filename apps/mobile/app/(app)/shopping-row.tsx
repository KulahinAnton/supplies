import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { groupIdForStorage, moveTargets } from "@supplies/core/shopping-groups";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Divider } from "@/components/ui/card";
import { Screen } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { useShoppingList } from "@/hooks/use-shopping-list";

/**
 * What a long press on a list row opens — rename, note, move, archive, delete.
 *
 * On the web these are four separate affordances: a "…" menu, an edit dialog
 * and a drag. A phone has no room for a trailing menu on a row that is already
 * a checkbox, so they arrive together in one sheet reached by the gesture the
 * platform already teaches for "more about this".
 *
 * **The move list comes from `moveTargets`, not from `groups`.** Feature 11's
 * «Загальна група» has no row in the database — it is `groupId = null` — so
 * the list of places a row can go is a rule, and `groupIdForStorage` is the
 * translation back. Building either here would be a second implementation of
 * the one case that is interesting.
 */
export default function ShoppingRowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const list = useShoppingList();

  const row = list.rows.find((one) => one.id === id);
  const [text, setText] = useState(row?.label ?? "");
  const [note, setNote] = useState(row?.note ?? "");

  if (!row) {
    return (
      <Screen>
        <View className="gap-4">
          <Text className="text-base text-foreground">Рядок уже змінився.</Text>
          <Button label="Закрити" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  /** Every write here closes the sheet; the list behind it is already stale. */
  function run(work: () => Promise<unknown>) {
    list.run(work);
    router.back();
  }

  /**
   * A free-text row owns its label and a row that names a real item does not:
   * its label is the item's name, and renaming it here would rename the
   * product in everybody's inventory.
   */
  const isFreeText = row.itemId === null;
  const targets = moveTargets(row.groupId, list.groups);

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="gap-5"
      >
        <Text className="text-xl font-semibold text-foreground">{row.label}</Text>

        {isFreeText ? (
          <TextField label="Назва" value={text} onChangeText={setText} />
        ) : (
          <Text className="text-sm text-muted-foreground">
            Це товар із запасів — його назва змінюється на сторінці товару.
          </Text>
        )}

        <TextField
          label="Нотатка"
          value={note}
          onChangeText={setNote}
          hint="Наприклад, «той, що в синій пачці»."
        />

        <Button
          label="Зберегти"
          disabled={list.pending}
          onPress={() =>
            run(() =>
              api.post(`/api/shopping/${row.id}/update`, {
                freeText: isFreeText ? text.trim() : undefined,
                note,
              }),
            )
          }
        />

        {targets.length > 0 ? (
          <View className="gap-2">
            <Text className="text-sm font-medium text-foreground">Перекласти до</Text>
            <View className="rounded-lg border border-border bg-card px-3">
              {targets.map((target, index) => (
                <View key={target.id}>
                  {index > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    disabled={list.pending}
                    onPress={() =>
                      run(() =>
                        api.post(`/api/shopping-groups/rows/${row.id}/move`, {
                          groupId: groupIdForStorage(target.id),
                        }),
                      )
                    }
                    className="py-3 active:opacity-60"
                  >
                    <Text className="text-sm text-foreground">{target.name}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View className="gap-3">
          {/*
            Feature 14.2 — archived is not deleted. A row put away still says
            who added it and who bought it, which is the history the shared
            list is for.
          */}
          <Button
            label={row.archivedAt ? "Повернути до списку" : "Прибрати в архів"}
            variant="ghost"
            disabled={list.pending}
            onPress={() =>
              run(() =>
                api.post(`/api/shopping/${row.id}/archive`, {
                  archived: row.archivedAt === null,
                }),
              )
            }
          />
          <Button
            label="Видалити"
            variant="ghost"
            disabled={list.pending}
            onPress={() => run(() => api.del(`/api/shopping/${row.id}`))}
          />
          <Button label="Закрити" variant="ghost" onPress={() => router.back()} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
