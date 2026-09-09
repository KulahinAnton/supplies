import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Switch, Text, View } from "react-native";
import type { Household } from "@supplies/core/contracts/settings";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { Button } from "@/components/ui/button";
import { ErrorNote, Spinner } from "@/components/ui/feedback";
import { Screen } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { useWrite } from "@/hooks/use-settings-write";

/**
 * §3.5/§7 — `expiryWarnDays` and `digestHour` are household **data**, not
 * constants. The engine takes them as input, so changing the warn window here
 * changes what «Скоро зіпсується» means everywhere at once: this app, the
 * dashboard, the SPA, the Next app and the Telegram digest.
 */
export default function HouseholdScreen() {
  const household = useQuery({
    queryKey: keys.household,
    queryFn: () => api.get<Household>("/api/household"),
  });

  if (household.isPending) {
    return (
      <Screen edges={["left", "right"]}>
        <Spinner />
      </Screen>
    );
  }
  if (!household.data) {
    return (
      <Screen edges={["left", "right"]}>
        <ErrorNote error={household.error} />
      </Screen>
    );
  }

  return <HouseholdForm initial={household.data} />;
}

function HouseholdForm({ initial }: { initial: Household }) {
  const { write, refusal, pending } = useWrite();
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(false);

  return (
    <Screen edges={["left", "right"]}>
      <TextField
        label="Назва родини"
        value={values.name}
        onChangeText={(name) => setValues({ ...values, name })}
        capitalize="sentences"
      />

      <TextField
        label="Попереджати за (днів)"
        value={String(values.expiryWarnDays)}
        onChangeText={(value) =>
          setValues({ ...values, expiryWarnDays: Number(value) || 0 })
        }
        keyboard="numeric"
        hint="Скільки днів до кінця терміну вважати «псується»."
      />

      <TextField
        label="Година нагадування"
        value={String(values.digestHour)}
        onChangeText={(value) => setValues({ ...values, digestHour: Number(value) || 0 })}
        keyboard="numeric"
        hint="Використовується, лише якщо запускати розсилку вручну щогодини. У проді зведення приходить о 12:00 за київським часом."
      />

      {/*
        Feature 32.1 — off by default. Every press of the recipe button spends
        money at an external provider, so a household that never asked for that
        does not get a tab offering it.
      */}
      <View className="flex-row items-start justify-between gap-4 rounded-lg border border-border bg-card p-3">
        <View className="flex-1 gap-1">
          <Text className="text-sm font-medium text-foreground">
            Помічник зі стравами (AI)
          </Text>
          <Text className="text-xs text-muted-foreground">
            Вмикає вкладку «Рецепти». Пропозиції готує Claude — це платні
            запити до зовнішнього сервісу, по одному на кожне натискання.
          </Text>
        </View>
        <Switch
          value={values.aiEnabled}
          onValueChange={(aiEnabled) => setValues({ ...values, aiEnabled })}
        />
      </View>

      {refusal ? (
        <View className="rounded-lg bg-destructive/10 px-3 py-2.5">
          <Text className="text-sm text-destructive">{refusal}</Text>
        </View>
      ) : null}
      {saved ? <Text className="text-sm text-primary">Збережено.</Text> : null}

      <Button
        label="Зберегти"
        busy={pending}
        onPress={() => {
          setSaved(false);
          void write(() =>
            api.patch("/api/settings/household", {
              name: values.name,
              expiryWarnDays: values.expiryWarnDays,
              digestHour: values.digestHour,
              aiEnabled: values.aiEnabled,
            }),
          ).then((ok) => setSaved(ok));
        }}
      />
    </Screen>
  );
}
