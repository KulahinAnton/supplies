"use client";

import { useCallback, useEffect, useState } from "react";
import { useOnline } from "@/hooks/use-online";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderStoredMessage } from "@/lib/messages";
import { listOutbox, onOutboxChange, removeOps, retryFailed } from "@/lib/offline/outbox";
import type { OutboxEntry } from "@/lib/offline/outbox";
import { flushOutbox } from "@/lib/offline/sync-client";

/**
 * Feature 31 — the state of things the user did without a signal.
 *
 * Three jobs, in the order they matter:
 *
 * 1. Say the app is offline, because a page served from cache is otherwise
 *    indistinguishable from a live one and the stock numbers on it are a
 *    claim about the past.
 * 2. Count what is waiting, so "did that save?" has an answer on screen.
 * 3. Show what was REFUSED. A queued take can fail honestly — someone else
 *    finished the milk — and the user has to be told, or the app has quietly
 *    lost something they believe they did.
 */

const KIND_LABEL: Record<OutboxEntry["kind"], string> = {
  addStock: "Додавання запасу",
  consume: "Списання",
  consumeBatch: "Списання партії",
};

export function OfflineBanner() {
  const router = useRouter();
  const online = useOnline();
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [flushing, setFlushing] = useState(false);

  const reload = useCallback(() => {
    listOutbox().then(setEntries).catch(() => setEntries([]));
  }, []);

  /**
   * No spinner state in here: the mount flush runs straight from an effect,
   * and setting state synchronously there cascades renders (and trips the
   * react-hooks rule). The button wraps this in `flushNow`, which is the only
   * place a spinner means anything.
   */
  const flush = useCallback(async () => {
    try {
      const outcome = await flushOutbox();
      if (outcome.unauthorized) {
        toast.error("Сесія завершилася. Увійдіть, щоб надіслати зміни.");
        return;
      }
      if (outcome.applied > 0) {
        toast.success(`Синхронізовано: ${outcome.applied}`);
        // The pages were rendered before these applied; they are now wrong.
        router.refresh();
      }
      if (outcome.failed > 0) {
        toast.error(`Не вдалося застосувати: ${outcome.failed}`);
      }
    } catch {
      // A failed flush is not worth a message: the queue is intact and the
      // next `online` event will try again.
    } finally {
      reload();
    }
  }, [reload, router]);

  const flushNow = useCallback(async () => {
    setFlushing(true);
    try {
      await flush();
    } finally {
      setFlushing(false);
    }
  }, [flush]);

  useEffect(() => {
    reload();
    const stopWatching = onOutboxChange(reload);

    // The connection coming back is the moment to send. A tab opened while
    // already online never sees that event, so the queue is also flushed once
    // on mount — otherwise it would sit there until the signal dropped and
    // returned again.
    const goOnline = () => void flush();
    window.addEventListener("online", goOnline);
    if (navigator.onLine) void flush();

    return () => {
      window.removeEventListener("online", goOnline);
      stopWatching();
    };
  }, [flush, reload]);

  const failed = entries.filter((entry) => entry.failedAt);
  const pending = entries.filter((entry) => !entry.failedAt);

  if (online && entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {!online ? (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <CloudOff className="size-4 shrink-0 text-warning-foreground dark:text-warning" />
          <span className="text-warning-foreground dark:text-warning">
            Немає з&apos;єднання. Дані на екрані — з останнього разу; зміни
            надішлемо, коли зв&apos;язок повернеться.
          </span>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Очікують надсилання: {pending.length}
          </span>
          {online ? (
            <Button size="sm" variant="ghost" disabled={flushing} onClick={flushNow}>
              <RefreshCw className={flushing ? "size-4 animate-spin" : "size-4"} />
              Надіслати
            </Button>
          ) : null}
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <TriangleAlert className="size-4 shrink-0" />
            Не вдалося застосувати: {failed.length}
          </div>
          <ul className="mt-2 space-y-1.5">
            {failed.map((entry) => (
              <li
                key={entry.clientOpId}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="min-w-0">
                  <span className="font-medium">{KIND_LABEL[entry.kind]}</span>
                  <span className="text-muted-foreground">
                    {" — "}
                    {renderStoredMessage(entry.error)}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Спробувати ще раз"
                    onClick={async () => {
                      await retryFailed(entry.clientOpId);
                      await flushNow();
                    }}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Прибрати"
                    onClick={() => removeOps([entry.clientOpId])}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
