"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  deleteCategoryAction,
  saveCategoryAction,
} from "@/lib/actions/settings";
import { renderMessage } from "@/lib/messages";

export type CategoryRow = {
  id: string;
  name: string;
  itemCount: number;
  /** Feature 13 — null means inherit the household window. */
  expiryWarnDays: number | null;
};

/**
 * Feature 13 — categories carry their own expiry warning window.
 *
 * Separate from the generic named-list panel that storage locations still use,
 * because only categories have this field, and a shared component that ignores
 * half its props for one caller is worse than two honest ones.
 *
 * An EMPTY days field means inherit. That is distinct from 0, which means "warn
 * me only on the day itself" — so clearing the box must send null, not zero.
 */
export function CategoryPanel({
  rows,
  householdWarnDays,
}: {
  rows: CategoryRow[];
  householdWarnDays: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [edited, setEdited] = useState<Record<string, string>>({});

  async function run(
    work: () => Promise<{ ok: boolean; error?: Parameters<typeof renderMessage>[0] }>,
    onOk: () => void,
  ) {
    setPending(true);
    const result = await work();
    setPending(false);
    if (!result.ok && result.error) {
      toast.error(renderMessage(result.error));
      return false;
    }
    onOk();
    router.refresh();
    return true;
  }

  function daysValue(row: CategoryRow) {
    return edited[row.id] ?? (row.expiryWarnDays === null ? "" : String(row.expiryWarnDays));
  }

  const isDirty = (row: CategoryRow) =>
    edited[row.id] !== undefined && edited[row.id] !== daysValueOf(row);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Категорії</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-xs text-muted-foreground">
          Порожнє поле — попереджати як усюди ({householdWarnDays} дн.). Вкажіть
          своє число, щоб, наприклад, про ліки нагадувало за два тижні.
        </p>

        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{row.name}</div>
                <div className="text-xs text-muted-foreground">
                  {row.itemCount > 0 ? `товарів: ${row.itemCount}` : "порожньо"}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={365}
                  inputMode="numeric"
                  aria-label={`Попереджати за скільки днів: ${row.name}`}
                  placeholder={String(householdWarnDays)}
                  className="w-20"
                  value={daysValue(row)}
                  onChange={(event) =>
                    setEdited({ ...edited, [row.id]: event.target.value })
                  }
                />
                <span className="text-xs text-muted-foreground">дн.</span>
              </div>

              {isDirty(row) ? (
                <Button
                  size="icon"
                  aria-label={`Зберегти ${row.name}`}
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        saveCategoryAction({
                          id: row.id,
                          name: row.name,
                          expiryWarnDays: edited[row.id],
                        }),
                      () => {
                        const next = { ...edited };
                        delete next[row.id];
                        setEdited(next);
                        toast.success("Збережено");
                      },
                    )
                  }
                >
                  <Check className="size-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Видалити ${row.name}`}
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => deleteCategoryAction(row.id),
                      () => toast.success("Видалено"),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <Input
            value={draft}
            placeholder="Нова категорія"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (draft.trim()) {
                  void run(
                    () => saveCategoryAction({ name: draft }),
                    () => {
                      setDraft("");
                      toast.success("Додано");
                    },
                  );
                }
              }
            }}
          />
          <Button
            disabled={pending || !draft.trim()}
            onClick={() =>
              run(
                () => saveCategoryAction({ name: draft }),
                () => {
                  setDraft("");
                  toast.success("Додано");
                },
              )
            }
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** The value the input would show if it had not been edited. */
function daysValueOf(row: CategoryRow) {
  return row.expiryWarnDays === null ? "" : String(row.expiryWarnDays);
}
