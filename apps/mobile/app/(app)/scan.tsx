import { useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { renderMessage } from "@supplies/core/messages";
import type { BarcodeItem } from "@supplies/core/contracts/items";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api/client";

/**
 * Feature 21 — scan a barcode, go to the item.
 *
 * A hit navigates straight there, because the scan already said exactly which
 * product it is; making someone pick it out of a filtered list would be asking
 * a question with one answer. A miss stays here and says so.
 *
 * **The lookup is the API's, not this screen's.** `GET /barcode/:code/item` is
 * the same endpoint the SPA calls, so "do we have this?" has one answer
 * wherever it is asked — and the barcode-to-product chain behind it
 * (Open Food Facts, GS1, METRO) lives in `@supplies/db/barcode-service` where
 * all four clients reach it.
 */

/**
 * Grocery symbologies only. Leaving `qr` on would let a poster, a payment code
 * or a wifi sticker fire the lookup, and every one of those is a miss that
 * looks like the app being wrong.
 */
const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128"] as const;

type Outcome =
  | { state: "scanning" }
  /**
   * The camera would not start. Found on an emulator whose AVD has only a
   * front lens, and real on any device with no rear camera or a broken one —
   * a tablet, or a phone whose camera another app is holding.
   *
   * Before this, the failure was a black screen politely captioned «Наведіть
   * камеру на штрихкод», which is the app confidently instructing someone to
   * use hardware it has just failed to open.
   */
  | { state: "unavailable" }
  | { state: "looking"; code: string }
  | { state: "missing"; code: string }
  | { state: "error"; code: string; message: string };

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [outcome, setOutcome] = useState<Outcome>({ state: "scanning" });

  /**
   * The camera fires this for **every frame** it can read a code in, so
   * without a latch one barcode becomes a dozen lookups and a dozen
   * navigations. A ref rather than state: it has to be true before the next
   * frame arrives, and a state update is not.
   */
  const busy = useRef(false);

  async function onScanned(code: string) {
    if (busy.current) return;
    busy.current = true;
    setOutcome({ state: "looking", code });

    try {
      const found = await api.get<BarcodeItem>(
        `/api/barcode/${encodeURIComponent(code)}/item`,
      );
      if (found.kind === "found") {
        // `replace`, not `push`: coming Back from the item should return to
        // the list, not to a camera that would immediately scan it again.
        router.replace({ pathname: "/items/[id]", params: { id: found.itemId } });
        return;
      }
      setOutcome({ state: "missing", code });
    } catch (cause) {
      /**
       * Never report a failure as "you do not have this". A broken lookup once
       * shipped as a confident "not found" in the Next app, which read as data
       * and contradicted the item form. Saying what actually happened is
       * better than a confident wrong answer.
       */
      setOutcome({
        state: "error",
        code,
        message:
          cause instanceof ApiError
            ? cause.message
            : renderMessage({ key: "error.unexpected" }),
      });
    }
  }

  function scanAgain() {
    busy.current = false;
    setOutcome({ state: "scanning" });
  }

  /**
   * Three permission states, and they are not the same conversation.
   * `null` is "still asking the OS", which is a spinner and not a prompt.
   * Denied-but-askable gets a button. Denied permanently has to send people to
   * Settings, because asking again does nothing and a button that silently
   * fails is worse than an explanation.
   */
  if (!permission) {
    return <Frame><Text className="text-sm text-muted-foreground">Готуємо камеру…</Text></Frame>;
  }

  if (!permission.granted) {
    return (
      <Frame>
        <Text className="text-center text-base text-foreground">
          Щоб сканувати штрихкоди, потрібен доступ до камери.
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          Знімки нікуди не надсилаються — код розпізнається на телефоні.
        </Text>
        {permission.canAskAgain ? (
          <Button label="Дозволити" onPress={() => void requestPermission()} />
        ) : (
          <Text className="text-center text-sm text-muted-foreground">
            Доступ вимкнено. Увімкніть камеру для «Запаси» в налаштуваннях
            телефона.
          </Text>
        )}
        <Button label="Назад" variant="ghost" onPress={() => router.back()} />
      </Frame>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        // Handing `undefined` while busy tells the native side to stop
        // delivering frames, rather than delivering them to a guard.
        onBarcodeScanned={
          outcome.state === "scanning"
            ? (result) => void onScanned(result.data)
            : undefined
        }
        onMountError={() => setOutcome({ state: "unavailable" })}
      />

      <SafeAreaView edges={["top"]} className="absolute left-0 right-0 top-0">
        <View className="flex-row justify-end p-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрити"
            onPress={() => router.back()}
            className="rounded-full bg-black/60 px-4 py-2"
          >
            <Text className="text-sm font-medium text-white">Закрити</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={["bottom"]} className="absolute bottom-0 left-0 right-0">
        <View className="gap-3 p-5">
          {outcome.state === "scanning" ? (
            <Text className="text-center text-sm text-white">
              Наведіть камеру на штрихкод.
            </Text>
          ) : null}

          {outcome.state === "unavailable" ? (
            <View className="gap-2 rounded-lg bg-card p-4">
              <Text className="text-sm text-foreground">
                Не вдалося увімкнути камеру.
              </Text>
              <Text className="text-xs text-muted-foreground">
                Можливо, її зайняв інший застосунок, або на цьому пристрої немає
                задньої камери. Товар можна знайти пошуком за назвою.
              </Text>
              <Button label="Назад" onPress={() => router.back()} />
            </View>
          ) : null}

          {outcome.state === "looking" ? (
            <Text className="text-center text-sm text-white">Шукаємо…</Text>
          ) : null}

          {outcome.state === "missing" ? (
            <View className="gap-2 rounded-lg bg-card p-4">
              <Text className="text-sm text-foreground">
                Штрихкоду{" "}
                <Text className="font-medium">{outcome.code}</Text> ще немає
                серед ваших запасів.
              </Text>
              {/*
                The web clients offer «Створити ‹code›» here. The phone has no
                item form yet — that is Phase 3.6 — and a button that leads
                nowhere is worse than saying so plainly.
              */}
              <Text className="text-xs text-muted-foreground">
                Додати новий товар поки можна у вебзастосунку.
              </Text>
              <Button label="Сканувати ще" onPress={scanAgain} />
            </View>
          ) : null}

          {outcome.state === "error" ? (
            <View className="gap-2 rounded-lg bg-card p-4">
              <Text className="text-sm text-destructive">{outcome.message}</Text>
              <Button label="Спробувати ще" onPress={scanAgain} />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

/** The centred frame the permission states share. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-background p-8">
      {children}
    </SafeAreaView>
  );
}
