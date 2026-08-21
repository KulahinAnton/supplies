"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { changePasswordAction, createInviteAction } from "@/lib/actions/auth";
import {
  createTelegramLinkAction,
  sendDigestNowAction,
} from "@/lib/actions/telegram";
import { updateHouseholdAction } from "@/lib/actions/settings";
import { renderMessage, type RuleMessage } from "@/lib/messages";

async function handle(
  work: () => Promise<{ ok: boolean; error?: RuleMessage }>,
  onOk: () => void,
) {
  const result = await work();
  if (!result.ok && result.error) {
    toast.error(renderMessage(result.error));
    return false;
  }
  onOk();
  return true;
}

export function HouseholdPanel({
  name,
  expiryWarnDays,
  digestHour,
}: {
  name: string;
  expiryWarnDays: number;
  digestHour: number;
}) {
  const router = useRouter();
  const [values, setValues] = useState({ name, expiryWarnDays, digestHour });
  const [pending, setPending] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Родина</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="space-y-2">
          <Label htmlFor="household-name">Назва</Label>
          <Input
            id="household-name"
            value={values.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="warn-days">Попереджати за (днів)</Label>
            <Input
              id="warn-days"
              type="number"
              min={0}
              max={365}
              value={values.expiryWarnDays}
              onChange={(event) =>
                setValues({ ...values, expiryWarnDays: Number(event.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">
              Скільки днів до кінця терміну вважати «псується».
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="digest-hour">Година нагадування</Label>
            <Input
              id="digest-hour"
              type="number"
              min={0}
              max={23}
              value={values.digestHour}
              onChange={(event) =>
                setValues({ ...values, digestHour: Number(event.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">
              Використовується, лише якщо запускати розсилку вручну щогодини.
              На Vercel зведення приходить о 12:00 за київським часом.
            </p>
          </div>
        </div>

        <Button
          disabled={pending}
          onClick={async () => {
            setPending(true);
            await handle(
              () => updateHouseholdAction(values),
              () => {
                toast.success("Збережено");
                router.refresh();
              },
            );
            setPending(false);
          }}
        >
          Зберегти
        </Button>
      </CardContent>
    </Card>
  );
}

export function InvitePanel({ members }: { members: { id: string; name: string; email: string }[] }) {
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Учасники</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <ul className="divide-y">
          {members.map((member) => (
            <li key={member.id} className="py-2">
              <div className="text-sm font-medium">{member.name}</div>
              <div className="text-xs text-muted-foreground">{member.email}</div>
            </li>
          ))}
        </ul>

        <Button
          variant="outline"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            const result = await createInviteAction();
            setPending(false);
            if (!result.ok) {
              toast.error(renderMessage(result.error));
              return;
            }
            setLink(result.data.url);
          }}
        >
          Створити запрошення
        </Button>

        {link ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Одноразове посилання, дійсне 7 днів:
            </p>
            <div className="flex gap-2">
              <Input readOnly value={link} onFocus={(e) => e.target.select()} />
              <Button
                size="icon"
                variant="outline"
                aria-label="Скопіювати"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  toast.success("Скопійовано");
                }}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TelegramPanel({ linked }: { linked: boolean }) {
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
            onClick={async () => {
              setPending(true);
              const result = await createTelegramLinkAction();
              setPending(false);
              if (!result.ok) {
                toast.error(renderMessage(result.error));
                return;
              }
              setLink(result.data.url);
            }}
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
              onClick={async () => {
                setPending(true);
                const result = await sendDigestNowAction();
                setPending(false);
                if (!result.ok) {
                  toast.error(renderMessage(result.error));
                  return;
                }
                toast.success(
                  result.data.hadNews
                    ? `Надіслано (чатів: ${result.data.messages})`
                    : "Немає про що нагадувати — нічого не надіслано",
                );
              }}
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
              <p className="text-xs text-muted-foreground">
                Дійсне 15 хвилин.
              </p>
              {/* Secondary: for linking a chat on a different device. */}
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  toast.success("Скопійовано");
                }}
              >
                <Copy className="size-3.5" />
                Скопіювати
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PasswordPanel() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Пароль</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="space-y-2">
          <Label htmlFor="current-password">Поточний</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">Новий</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </div>
        <Button
          disabled={pending || !current || !next}
          onClick={async () => {
            setPending(true);
            await handle(
              () =>
                changePasswordAction({ currentPassword: current, newPassword: next }),
              () => {
                toast.success("Пароль змінено");
                setCurrent("");
                setNext("");
              },
            );
            setPending(false);
          }}
        >
          Змінити пароль
        </Button>
      </CardContent>
    </Card>
  );
}
