import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { formatUsd } from "@supplies/core/format";
import type { Household } from "@supplies/core/contracts/settings";
import { api, SLOW_TIMEOUT_MS, type ApiError } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { Button } from "@/components/ui/button";
import { ErrorNote, Spinner } from "@/components/ui/feedback";
import { Screen } from "@/components/ui/screen";

type RecipeSuggestion = {
  text: string;
  usage: { input: number; output: number };
  costUsd: number | null;
};

/**
 * Feature 32 — «Рецепти».
 *
 * Nothing is asked of the model until somebody presses the button. Every
 * render would otherwise be a charge, and a suggestion nobody asked for is not
 * worth paying for.
 *
 * It is a screen under «Ще» rather than a tab, because Feature 32.1 makes it
 * off by default: a fifth tab that is usually absent is a worse tab bar than
 * four that are always there. The screen still checks `aiEnabled` — and so
 * does the API, which is the check that matters. A hidden link is not an
 * access control.
 */
export default function RecipesScreen() {
  const router = useRouter();

  const household = useQuery({
    queryKey: keys.household,
    queryFn: () => api.get<Household>("/api/household"),
  });

  const suggest = useMutation({
    mutationFn: () =>
      api.post<RecipeSuggestion>("/api/recipes/suggest", undefined, {
        timeoutMs: SLOW_TIMEOUT_MS,
      }),
  });

  if (household.isPending) {
    return (
      <Screen edges={["left", "right"]}>
        <Spinner />
      </Screen>
    );
  }

  if (!household.data?.aiEnabled) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="gap-3 rounded-lg border border-border bg-card p-4">
          <Text className="text-sm text-foreground">
            Помічник зі стравами вимкнено.
          </Text>
          <Text className="text-sm text-muted-foreground">
            Кожна порада — платний запит до зовнішнього сервісу, тож помічник
            вмикається вручну.
          </Text>
          <Button
            label="До налаштувань родини"
            variant="ghost"
            onPress={() => router.push("/settings/household")}
          />
        </View>
      </Screen>
    );
  }

  /**
   * The rate limit gets its own words. `ApiError.key` carries the catalogue
   * key, so "too many requests" can be answered with "try again in a minute"
   * instead of being rendered as a failure the reader is meant to do something
   * about.
   */
  const rateLimited = (suggest.error as ApiError | null)?.key === "error.rateLimited";

  return (
    <Screen edges={["left", "right"]}>
      <Text className="text-sm text-muted-foreground">
        Одна страва з того, що є вдома. Прострочене не пропонується.
      </Text>

      <Button
        label={suggest.isPending ? "Думаємо…" : "Що приготувати?"}
        busy={suggest.isPending}
        onPress={() => suggest.mutate()}
      />

      {rateLimited ? (
        <View className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
          <Text className="text-sm text-warning-foreground">
            Забагато запитів поспіль — спробуйте за хвилину.
          </Text>
        </View>
      ) : (
        <ErrorNote error={suggest.error} />
      )}

      {suggest.data ? (
        <View className="gap-3 rounded-lg border border-border bg-card p-4">
          {/*
            The model's own layout, kept as it came. A recipe is prose with a
            shape, and every parser for that shape is wrong eventually.
          */}
          <Text selectable className="text-sm leading-6 text-foreground">
            {suggest.data.text}
          </Text>
          <Text className="text-xs text-muted-foreground">
            Надіслано {suggest.data.usage.input} токенів (ваш список), отримано{" "}
            {suggest.data.usage.output} (рецепт)
            {suggest.data.costUsd !== null
              ? ` · приблизно ${formatUsd(suggest.data.costUsd)}`
              : ""}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
