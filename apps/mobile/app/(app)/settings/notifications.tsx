import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { Spinner } from "@/components/ui/feedback";
import { permissionState, type PermissionState } from "@/lib/push/module";
import { registerForPush, type PushOutcome } from "@/lib/push/register";

/**
 * Feature 35 — «Сповіщення».
 *
 * The permission prompt is asked **here** and nowhere else. iOS and Android
 * both give an app one chance at it, and spending that on a cold launch —
 * before anybody knows what the app is for — is how an app ends up with
 * notifications permanently denied and no way back except the system settings.
 * A screen somebody navigated to is a place where the question makes sense.
 *
 * There is no switch to turn reminders off, only the OS's own. A second toggle
 * would create the state where the app thinks it may notify and the system
 * disagrees, and the honest answer to "stop these" is the one the platform
 * already provides.
 *
 * Nothing here imports `expo-notifications` — everything goes through
 * `lib/push/module`, for the reason written on it.
 */
export default function NotificationsScreen() {
  const [status, setStatus] = useState<PermissionState | null>(null);
  const [outcome, setOutcome] = useState<PushOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void permissionState().then((state) => {
      if (!cancelled) setStatus(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === null) {
    return (
      <Screen edges={["left", "right"]}>
        <Spinner />
      </Screen>
    );
  }

  return (
    <Screen edges={["left", "right"]}>
      <Text className="text-sm text-muted-foreground">
        Одне повідомлення на день — те саме, що приходить у Telegram: що
        псується і що закінчується. Більше нічого.
      </Text>

      <View className="gap-2 rounded-lg border border-border bg-card p-4">
        <Text className="text-sm font-medium text-foreground">
          {status === "granted" ? "Сповіщення дозволені." : "Сповіщення поки вимкнені."}
        </Text>
        {status === "denied" ? (
          <Text className="text-xs text-muted-foreground">
            Дозвіл можна повернути лише в налаштуваннях телефона — застосунок
            питає один раз.
          </Text>
        ) : null}
        {/*
          Not a failure, and not phrased as one: in Expo Go on Android this is
          the expected answer, and the feature is fine — the development client
          is what cannot carry it.
        */}
        {status === "unavailable" ? (
          <Text className="text-xs text-muted-foreground">
            У цьому середовищі сповіщення недоступні. Потрібна власна збірка
            застосунку — Expo Go на Android їх не отримує.
          </Text>
        ) : null}
      </View>

      {outcome?.state === "registered" ? (
        <Text className="text-sm text-primary">
          Цей пристрій отримуватиме нагадування.
        </Text>
      ) : null}

      {outcome?.state === "unsupported" ? (
        <View className="rounded-lg bg-muted px-3 py-2.5">
          <Text className="text-sm text-muted-foreground">
            Це емулятор — сповіщення приходять лише на справжній телефон.
          </Text>
        </View>
      ) : null}

      {outcome?.state === "unavailable" ? (
        <View className="rounded-lg bg-warning/10 px-3 py-2.5">
          <Text className="text-sm text-warning-foreground">
            Не вдалося зареєструвати пристрій.
          </Text>
          <Text className="text-xs text-muted-foreground">{outcome.reason}</Text>
        </View>
      ) : null}

      {outcome?.state === "denied" ? (
        <View className="rounded-lg bg-muted px-3 py-2.5">
          <Text className="text-sm text-muted-foreground">
            {outcome.canAskAgain
              ? "Дозвіл не надано."
              : "Дозвіл вимкнено — увімкніть його в налаштуваннях телефона."}
          </Text>
        </View>
      ) : null}

      <Button
        label={status === "granted" ? "Оновити реєстрацію" : "Увімкнути сповіщення"}
        busy={busy}
        disabled={status === "unavailable"}
        onPress={() => {
          setBusy(true);
          void registerForPush()
            .then((result) => {
              setOutcome(result);
              return permissionState();
            })
            .then(setStatus)
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}
