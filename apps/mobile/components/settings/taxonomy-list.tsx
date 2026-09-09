import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { pluralUk } from "@supplies/core/format";
import { Button } from "@/components/ui/button";
import { Divider } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";

/** «1 товар · 2 товари · 5 товарів» — never a bare «товарів» for all three. */
const ITEM_FORMS = { one: "товар", few: "товари", many: "товарів" };

export type TaxonomyRow = {
  id: string;
  name: string;
  itemCount: number;
  isDefault: boolean;
  /** Feature 13 — categories only; null means "inherit the household window". */
  warnDays?: number | null;
};

/**
 * Categories and storage locations, which are the same screen twice.
 *
 * **Reorder is two arrows, not a drag.** The web list uses dnd-kit, and the
 * phone deliberately does not: a drag competing with the vertical scroll of
 * the screen it lives on is a gesture people fire by accident, and the same
 * reasoning already applies to «Покупки». Arrows are unglamorous and cannot
 * be triggered by scrolling past.
 *
 * A delete is *expected* to be refused when the row still has items — the
 * items would silently lose their category — so the count sits on every row,
 * where somebody can see the answer before pressing.
 */
export function TaxonomyList({
  rows,
  addPlaceholder,
  defaultHint,
  warnDaysPlaceholder,
  pending,
  refusal,
  onAdd,
  onSave,
  onSetDefault,
  onDelete,
  onReorder,
}: {
  rows: TaxonomyRow[];
  addPlaceholder: string;
  defaultHint: string;
  /** Present for categories only — the household window each row inherits. */
  warnDaysPlaceholder?: number;
  pending: boolean;
  refusal: string | null;
  onAdd: (name: string) => void;
  /** One write per save: the API takes the name and the window together. */
  onSave: (row: TaxonomyRow, edits: { name: string; warnDays: string }) => void;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");
  const [editedDays, setEditedDays] = useState("");

  function move(index: number, delta: number) {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    if (row) next.splice(target, 0, row);
    onReorder(next.map((one) => one.id));
  }

  function startEditing(row: TaxonomyRow) {
    setEditing(row.id);
    setEditedName(row.name);
    setEditedDays(row.warnDays === null || row.warnDays === undefined ? "" : String(row.warnDays));
  }

  return (
    <View className="gap-5">
      <Text className="text-sm text-muted-foreground">{defaultHint}</Text>

      {refusal ? (
        <View className="rounded-lg bg-destructive/10 px-3 py-2.5">
          <Text className="text-sm text-destructive">{refusal}</Text>
        </View>
      ) : null}

      <View className="rounded-lg border border-border bg-card px-4">
        {rows.map((row, index) => (
          <View key={row.id}>
            {index > 0 ? <Divider /> : null}

            {editing === row.id ? (
              <View className="gap-3 py-3">
                <TextField
                  label="Назва"
                  value={editedName}
                  onChangeText={setEditedName}
                  capitalize="sentences"
                />
                {warnDaysPlaceholder !== undefined ? (
                  <TextField
                    label="Попереджати за (днів)"
                    value={editedDays}
                    onChangeText={setEditedDays}
                    keyboard="numeric"
                    placeholder={String(warnDaysPlaceholder)}
                    hint={`Порожньо — як усюди, за ${warnDaysPlaceholder} дн.`}
                  />
                ) : null}
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Button
                      label="Зберегти"
                      disabled={pending || editedName.trim().length === 0}
                      onPress={() => {
                        onSave(row, {
                          name: editedName.trim(),
                          warnDays: editedDays.trim(),
                        });
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
                  accessibilityLabel={`Редагувати ${row.name}`}
                  onPress={() => startEditing(row)}
                  className="min-w-0 flex-1 active:opacity-60"
                >
                  <Text numberOfLines={1} className="text-base text-foreground">
                    {row.isDefault ? "★ " : ""}
                    {row.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {row.itemCount} {pluralUk(row.itemCount, ITEM_FORMS)}
                    {row.warnDays !== null && row.warnDays !== undefined
                      ? ` · попереджати за ${row.warnDays} дн.`
                      : ""}
                  </Text>
                </Pressable>

                <IconButton
                  label={`Вище: ${row.name}`}
                  glyph="↑"
                  disabled={pending || index === 0}
                  onPress={() => move(index, -1)}
                />
                <IconButton
                  label={`Нижче: ${row.name}`}
                  glyph="↓"
                  disabled={pending || index === rows.length - 1}
                  onPress={() => move(index, 1)}
                />
                <IconButton
                  label={`Зробити типовою: ${row.name}`}
                  glyph="★"
                  disabled={pending || row.isDefault}
                  onPress={() => onSetDefault(row.id)}
                />
                <IconButton
                  label={`Видалити ${row.name}`}
                  glyph="✕"
                  disabled={pending}
                  onPress={() => onDelete(row.id)}
                />
              </View>
            )}
          </View>
        ))}
      </View>

      <View className="gap-2">
        <TextField
          label="Додати"
          value={draft}
          onChangeText={setDraft}
          placeholder={addPlaceholder}
          capitalize="sentences"
        />
        <Button
          label="Додати"
          variant="ghost"
          disabled={pending || draft.trim().length === 0}
          onPress={() => {
            onAdd(draft.trim());
            setDraft("");
          }}
        />
      </View>
    </View>
  );
}

function IconButton({
  label,
  glyph,
  disabled,
  onPress,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      // 40pt square: below that a row of four of these is a lottery.
      className={`h-10 w-10 items-center justify-center rounded-lg border border-border ${
        disabled ? "opacity-30" : "active:opacity-60"
      }`}
    >
      <Text className="text-sm text-foreground">{glyph}</Text>
    </Pressable>
  );
}
