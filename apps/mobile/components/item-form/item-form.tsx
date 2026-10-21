import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, Switch, Text, View } from "react-native";
import { findSimilar, type NamedItem } from "@supplies/core/duplicates";
import type { GroupView, Taxonomy } from "@supplies/core/contracts/settings";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { ChoiceField } from "@/components/item-form/choice-field";
import { DuplicateWarning } from "@/components/item-form/duplicate-warning";
import {
  UNIT_OPTIONS,
  useItemSave,
  type ItemFormValues,
} from "@/hooks/use-item-save";
import { api, SLOW_TIMEOUT_MS } from "@/lib/api/client";
import type { BarcodeLookup } from "@supplies/core/contracts/items";

/**
 * «Новий товар» and «Редагувати» — one component, because they differ by a
 * title, an endpoint and one locked field.
 *
 * Its starting values arrive as props rather than being copied out of a query
 * in an effect. The effect version renders once empty and once full and needs
 * a guard so the copy does not clobber what somebody has typed; seeding
 * `useState` from a prop the parent only renders once the data is there has
 * none of those problems. Same reasoning as `apps/spa/src/routes/item-form.tsx`.
 */
export function ItemForm({
  itemId,
  initial,
  taxonomy,
  itemGroups,
  existingItems,
  hasBatches,
}: {
  itemId?: string;
  initial: ItemFormValues;
  taxonomy: Taxonomy;
  itemGroups: GroupView[];
  existingItems: NamedItem[];
  hasBatches: boolean;
}) {
  const editing = Boolean(itemId);
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [looking, setLooking] = useState(false);
  const [lookup, setLookup] = useState<BarcodeLookup | null>(null);

  const set = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const { submit, issue, formError, saving } = useItemSave(itemId);

  /**
   * Feature 16.1 — recomputed as the name changes; excludes the item being
   * edited so it never flags itself. Matching runs on the device against names
   * already fetched: the list is small, and a warning that needs a round trip
   * arrives after the decision it was meant to inform.
   */
  const similar = findSimilar(values.name, existingItems, itemId);

  /**
   * Feature 18 — what the barcode turns out to be. The lookup is the API's,
   * so Open Food Facts, GS1 and METRO are consulted in the order
   * `@supplies/db/barcode-service` decides, once, for all four clients.
   */
  async function lookUp() {
    const code = values.barcode.trim();
    if (!code) return;
    setLooking(true);
    try {
      const found = await api.get<BarcodeLookup>(
        `/api/barcode/${encodeURIComponent(code)}`,
        { timeoutMs: SLOW_TIMEOUT_MS },
      );
      setLookup(found);
      // Into an EMPTY field only. Somebody who has typed a name has said what
      // this is, and a database that disagrees does not get to overrule them.
      if (found.kind === "product") {
        setValues((current) =>
          current.name.trim() ? current : { ...current, name: found.suggestedName },
        );
      }
    } catch {
      setLookup(null);
    } finally {
      setLooking(false);
    }
  }

  return (
    <View className="gap-5">
      <TextField
        label="Назва"
        value={values.name}
        onChangeText={(value) => set("name", value)}
        placeholder="Вода негазована 1,5 л"
        capitalize="sentences"
      />
      <DuplicateWarning matches={similar} />

      <ChoiceField
        label="Категорія"
        value={values.categoryId}
        options={taxonomy.categories.map((category) => ({
          value: category.id,
          label: category.name,
        }))}
        onChange={(value) => set("categoryId", value)}
      />

      <ChoiceField
        label="Де зберігається"
        value={values.locationId}
        options={[
          { value: "", label: "Не вказано" },
          ...taxonomy.locations.map((location) => ({
            value: location.id,
            label: location.name,
          })),
        ]}
        onChange={(value) => set("locationId", value)}
      />

      <ChoiceField
        label="Одиниця"
        value={values.unit}
        options={UNIT_OPTIONS}
        // §3.2 — locked once the item has batches: changing it would silently
        // reinterpret every quantity already recorded.
        disabled={hasBatches}
        hint={
          hasBatches
            ? "Одиницю не змінити, поки є партії — інакше вже записані кількості почали б означати інше."
            : undefined
        }
        onChange={(value) => set("unit", value)}
      />

      <TextField
        label="Мінімальний запас"
        value={values.minQty}
        onChangeText={(value) => set("minQty", value)}
        keyboard="decimal-pad"
        hint="0 — не попереджати про залишок."
      />

      {/*
        Feature 26 — a set owns the low-stock threshold, so a household short
        of «молоко» is reminded once rather than once per brand. The item's own
        minimum then stops applying, which the item list says out loud.
      */}
      {itemGroups.length > 0 ? (
        <ChoiceField
          label="Набір"
          value={values.groupId}
          options={[
            { value: "", label: "Без набору" },
            ...itemGroups.map((group) => ({ value: group.id, label: group.name })),
          ]}
          onChange={(value) => set("groupId", value)}
        />
      ) : null}

      <View className="gap-2">
        <TextField
          label="Штрихкод"
          value={values.barcode}
          onChangeText={(value) => set("barcode", value)}
          keyboard="numeric"
        />
        <View className="flex-row gap-2">
          <Button
            label={looking ? "Шукаємо…" : "Знайти товар"}
            variant="ghost"
            disabled={looking || values.barcode.trim().length === 0}
            onPress={() => void lookUp()}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/scan")}
            className="items-center justify-center rounded-lg border border-border bg-card px-4 active:opacity-70"
          >
            <Text className="text-sm font-medium text-foreground">Сканувати</Text>
          </Pressable>
        </View>

        {lookup?.kind === "existing" ? (
          <Text className="text-sm text-warning-foreground">
            Цей штрихкод уже має «{lookup.name}».
          </Text>
        ) : null}
        {lookup?.kind === "unknown" ? (
          <Text className="text-sm text-muted-foreground">
            {lookup.manufacturer
              ? `Нічого не знайшли. Виробник: ${lookup.manufacturer}.`
              : "Нічого не знайшли — назву доведеться вписати."}
          </Text>
        ) : null}

        {/*
          Feature 18.2 — publishing to Open Food Facts is an explicit opt-in,
          offered only when the lookup says the code is genuinely unknown
          there. Sending somebody's shopping to a public database by default
          would be the wrong kind of helpful.
        */}
        {lookup?.kind === "unknown" && lookup.canShare ? (
          <View className="flex-row items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
            <Text className="flex-1 text-sm text-foreground">
              Поділитися назвою з Open Food Facts
            </Text>
            <Switch
              value={values.shareToOff}
              onValueChange={(next) => set("shareToOff", next)}
            />
          </View>
        ) : null}
      </View>

      <TextField
        label="Нотатки"
        value={values.notes}
        onChangeText={(value) => set("notes", value)}
        capitalize="sentences"
        multiline
      />

      {issue ? <Text className="text-sm text-destructive">{issue}</Text> : null}
      {formError ? (
        <View className="rounded-lg bg-destructive/10 px-3 py-2.5">
          <Text className="text-sm text-destructive">{formError}</Text>
        </View>
      ) : null}

      <View className="gap-3">
        <Button
          label={editing ? "Зберегти" : "Додати товар"}
          busy={saving}
          onPress={() => submit(values)}
        />
        <Button label="Скасувати" variant="ghost" onPress={() => router.back()} />
      </View>
    </View>
  );
}
