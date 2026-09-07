import { useState } from "react";
import { ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@supplies/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@supplies/ui/card";
import { api } from "../../api/client";
import { useWrite } from "../../hooks/use-settings-write";
import { CopyButton } from "./copy-button";

export function TelegramPanel({ linked }: { linked: boolean }) {
  const [link, setLink] = useState<string | null>(null);
  const { write, pending } = useWrite([]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Telegram</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-sm text-muted-foreground">
          {linked
            ? "Чат прив'язано. Команди: /low, /expiring, /list, /add, /took."
            : "Прив'яжіть чат, щоб додавати запаси й дивитися список просто з Telegram."}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              void write(async () => {
                const result = await api.post<{ url: string }>("/api/telegram/link");
                setLink(result.url);
              })
            }
          >
            {linked ? "Прив'язати інший чат" : "Прив'язати Telegram"}
          </Button>

          {/*
            Feature 19.1 — the same message the daily digest sends, on demand.
            It deliberately does not mark the day as done, so the automatic one
            still arrives: the two run in parallel rather than competing.
          */}
          {linked ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                void write(async () => {
                  const result = await api.post<{ messages: number; hadNews: boolean }>(
                    "/api/telegram/digest",
                  );
                  toast.success(
                    result.hadNews
                      ? `Надіслано (чатів: ${result.messages})`
                      : "Немає про що нагадувати — нічого не надіслано",
                  );
                })
              }
            >
              <Send className="size-4" />
              Надіслати зведення зараз
            </Button>
          ) : null}
        </div>

        {/*
          Feature 17.1 — a link you can tap. It used to render in a read-only
          text box, which made the obvious action impossible: on a phone you
          want to open Telegram, not select a URL.
        */}
        {link ? (
          <div className="space-y-2">
            <Button
              className="w-full"
              nativeButton={false}
              render={<a href={link} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="size-4" />
              Відкрити бота в Telegram
            </Button>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Дійсне 15 хвилин.</p>
              {/* Secondary: for linking a chat on a different device. */}
              <CopyButton value={link} label="Скопіювати" small />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
