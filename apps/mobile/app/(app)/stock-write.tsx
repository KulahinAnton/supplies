import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { UNIT_SHORT, formatQuantityWithUnit } from "@supplies/core/format";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { Spinner } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { useItemDetail } from "@/hooks/use-item-detail";

/**
 * «Взяли» and «Поповнити», as a form sheet rather than a custom modal.
 *
 * A route with `presentation: "formSheet"` gets the native sheet animation,
 * the drag-to-dismiss grabber and the back gesture for nothing — all of which
 * a hand-rolled `<Modal>` would have to imitate badly. It is one file because
 * the two operations differ by a verb, a field and an endpoint; splitting them
 * would duplicate the shortfall handling that is the interesting part.
 *
 * The refusal renders INSIDE the sheet, next to the field. §3.3's shortfall
 * names exactly how much is missing — «Не вистачає 2 штук…» — so it belongs
 * beside the number that caused it, not in a toast somewhere else on screen.
 */
export default function StockWriteScreen() {
  const { itemId, mode } = useLocalSearchParams<{ itemId: string; mode: string }>();
  const router = useRouter();
  const { detail, write, pending } = useItemDetail(itemId ?? "");

  const [quantity, setQuantity] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const taking = mode !== "add";

  if (detail.isPending || !detail.data) {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }

  const { item, quantity: onHand } = detail.data;

  async function submit() {
    setError(null);
    const amount = quantity.trim();
    if (!amount) {
      setError("Вкажіть кількість.");
      return;
    }

    /**
     * Two endpoints, one screen. Neither is a local calculation: the API's
     * write path decides which batches a take comes out of (§3.3) and writes
     * the movement in the same transaction as the batch change (§7).
     */
    const refusal = await write(() =>
      taking
        ? api.post("/api/stock/consume", { itemId: item.id, quantity: amount })
        : api.post("/api/stock/add", {
            itemId: item.id,
            rows: [{ quantity: amount, expiresAt: expiresAt || undefined }],
          }),
    );

    if (refusal) {
      setError(refusal);
      return;
    }
    // Back to the item, whose query the write already invalidated — so the new
    // number is on screen before the sheet finishes animating away.
    router.back();
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="gap-5"
      >
        <View className="gap-1">
          <Text className="text-xl font-semibold text-foreground">
            {taking ? "Взяли" : "Поповнити"}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {item.name} · зараз {formatQuantityWithUnit(onHand, item.unit)}
          </Text>
        </View>

        <TextField
          label={`Скільки (${UNIT_SHORT[item.unit]})`}
          value={quantity}
          onChangeText={setQuantity}
          keyboard="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />

        {taking ? null : (
          <TextField
            label="Придатне до"
            value={expiresAt}
            onChangeText={setExpiresAt}
            hint="Необов'язково, у форматі 2026-12-31."
            keyboard="numeric"
            returnKeyType="done"
          />
        )}

        {error ? (
          <View className="rounded-lg bg-destructive/10 px-3 py-2.5">
            <Text className="text-sm text-destructive">{error}</Text>
          </View>
        ) : null}

        <View className="gap-3">
          <Button
            label={taking ? "Записати" : "Додати до запасів"}
            busy={pending}
            onPress={() => void submit()}
          />
          <Button label="Скасувати" variant="ghost" onPress={() => router.back()} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
