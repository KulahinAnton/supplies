import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { UNIT_SHORT } from "@supplies/core/format";
import { api, ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { useShoppingList } from "@/hooks/use-shopping-list";

/**
 * Feature 6 — «купили», and the stock write behind it.
 *
 * Ticking a row that names a real item is the moment the household actually
 * gained something, so this asks how much and until when, and the answer
 * becomes a `StockBatch` in the same request. Skipping the question is a first
 * class answer, not a cancel: «купили, але не рахуємо» ticks the row and
 * leaves the inventory alone, which is what happens when somebody buys a
 * coffee to drink now.
 *
 * The refusal renders inside the sheet next to the field, the same rule
 * `stock-write.tsx` follows — a shortfall names a quantity, and it belongs
 * beside the quantity that caused it.
 */
export default function ShoppingCheckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const list = useShoppingList();

  const [quantity, setQuantity] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const row = list.rows.find((one) => one.id === id);

  /**
   * The row is read out of the shared query cache rather than passed as a
   * param: params are strings, and a row serialised into the URL would be a
   * second copy that goes stale the moment anyone else in the household ticks
   * it. If it is gone, someone else got there first.
   */
  if (!row) {
    return (
      <Screen>
        <View className="gap-4">
          <Text className="text-base text-foreground">Рядок уже змінився.</Text>
          <Text className="text-sm text-muted-foreground">
            Схоже, хтось із родини щойно його купив або прибрав.
          </Text>
          <Button label="Закрити" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  async function check(withStock: boolean) {
    setError(null);
    setSaving(true);
    try {
      await api.post(`/api/shopping/${id}/check`, {
        // `withStock` is an argument rather than a cleared field: a setState
        // would not have applied by the time this runs.
        rows:
          withStock && quantity.trim()
            ? [{ quantity: quantity.trim(), expiresAt: expiresAt || undefined }]
            : undefined,
      });
      list.invalidate();
      router.back();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Щось пішло не так. Спробуйте ще раз.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="gap-5"
      >
        <View className="gap-1">
          <Text className="text-xl font-semibold text-foreground">Купили</Text>
          <Text className="text-sm text-muted-foreground">{row.label}</Text>
        </View>

        <TextField
          label={`Скільки${row.unit ? ` (${UNIT_SHORT[row.unit]})` : ""}`}
          value={quantity}
          onChangeText={setQuantity}
          hint="Порожньо — просто позначимо куплене, без запасів."
          keyboard="decimal-pad"
          returnKeyType="done"
        />

        <TextField
          label="Придатне до"
          value={expiresAt}
          onChangeText={setExpiresAt}
          hint="Необов'язково, у форматі 2026-12-31."
          keyboard="numeric"
          returnKeyType="done"
        />

        {error ? (
          <View className="rounded-lg bg-destructive/10 px-3 py-2.5">
            <Text className="text-sm text-destructive">{error}</Text>
          </View>
        ) : null}

        <View className="gap-3">
          <Button
            label="Купили — до запасів"
            busy={saving}
            disabled={quantity.trim().length === 0}
            onPress={() => void check(true)}
          />
          <Button
            label="Купили, але не рахуємо"
            variant="ghost"
            disabled={saving}
            onPress={() => void check(false)}
          />
          <Button
            label="Скасувати"
            variant="ghost"
            disabled={saving}
            onPress={() => router.back()}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
