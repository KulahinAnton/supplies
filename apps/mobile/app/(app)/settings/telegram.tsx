import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { Text, View } from "react-native";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { Screen } from "@/components/ui/screen";
import { useWrite } from "@/hooks/use-settings-write";

/**
 * Feature 17 — linking a Telegram chat to this household.
 *
 * **The link is opened, not displayed.** Feature 17.1 already learned this on
 * the web: it used to render in a read-only text box, which made the obvious
 * action impossible. On a phone that is even starker — Telegram is almost
 * certainly installed on the same device, so the primary action is «open it»
 * and copying is the fallback for linking a chat somewhere else.
 */
export default function TelegramScreen() {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const { write, refusal, pending } = useWrite([keys.telegram]);

  const state = useQuery({
    queryKey: keys.telegram,
    queryFn: () => api.get<{ linked: boolean }>("/api/telegram/linked"),
  });

  if (state.isPending) {
    return (
      <Screen edges={["left", "right"]}>
        <Spinner />
      </Screen>
    );
  }

  const linked = state.data?.linked ?? false;

  return (
    <Screen edges={["left", "right"]}>
      <Text className="text-sm text-muted-foreground">
        {linked
          ? "Чат прив'язано. Команди: /low, /expiring, /list, /add, /took."
          : "Прив'яжіть чат, щоб додавати запаси й дивитися список просто з Telegram."}
      </Text>

      {refusal ? (
        <View className="rounded-lg bg-destructive/10 px-3 py-2.5">
          <Text className="text-sm text-destructive">{refusal}</Text>
        </View>
      ) : null}

      <Button
        label={linked ? "Прив'язати інший чат" : "Прив'язати Telegram"}
        variant="ghost"
        busy={pending}
        onPress={() => {
          setCopied(false);
          void write(async () => {
            const result = await api.post<{ url: string }>("/api/telegram/link");
            setLink(result.url);
          });
        }}
      />

      {link ? (
        <View className="gap-2 rounded-lg border border-border bg-card p-3">
          <Button
            label="Відкрити бота в Telegram"
            onPress={() => void Linking.openURL(link)}
          />
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-xs text-muted-foreground">Дійсне 15 хвилин.</Text>
            <Button
              label={copied ? "Скопійовано" : "Скопіювати"}
              variant="ghost"
              onPress={() => void Clipboard.setStringAsync(link).then(() => setCopied(true))}
            />
          </View>
        </View>
      ) : null}

      {/*
        Feature 19.1 — the same message the daily digest sends, on demand. It
        deliberately does not mark the day as done, so the automatic one still
        arrives: the two run in parallel rather than competing.
      */}
      {linked ? (
        <Button
          label="Надіслати зведення зараз"
          variant="ghost"
          busy={pending}
          onPress={() => {
            setSent(null);
            void write(async () => {
              const result = await api.post<{ messages: number; hadNews: boolean }>(
                "/api/telegram/digest",
              );
              setSent(
                result.hadNews
                  ? `Надіслано (чатів: ${result.messages})`
                  : "Немає про що нагадувати — нічого не надіслано",
              );
            });
          }}
        />
      ) : null}

      {sent ? <Text className="text-sm text-primary">{sent}</Text> : null}
    </Screen>
  );
}
