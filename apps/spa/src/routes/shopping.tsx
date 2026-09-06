import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { groupShoppingRows } from "@supplies/core/shopping-groups";
import { Button } from "@supplies/ui/button";
import { Card, CardContent } from "@supplies/ui/card";
import { Input } from "@supplies/ui/input";
import { cn } from "@supplies/ui/utils";
import { api } from "../api/client";
import { keys, stockWriteInvalidates } from "../api/keys";
import {
  reviveShoppingRow,
  type RevivedShoppingRow,
  type ShoppingView,
} from "../api/types";
import { EmptyNote, ErrorNote, Spinner } from "../components/feedback";

/**
 * «Покупки».
 *
 * The grouping is `groupShoppingRows` from `@supplies/core/shopping-groups` —
 * the same pure function the Next app uses — and that matters more than it
 * looks. Feature 11's «Загальна група» is not a row in the database; it is
 * `groupId = null`. Regrouping by hand here would be a second implementation
 * of a rule whose only interesting case is the one that has no row.
 *
 * Ticking a row is a stock-in for item rows (Feature 6), which is why checking
 * invalidates the stock keys and not just the list.
 *
 * Phase 2.9 — no drag-and-drop reordering and no per-row quantity edit yet;
 * both exist in the Next app.
 */
export function ShoppingRoute() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");

  const list = useQuery({
    queryKey: keys.shopping,
    queryFn: () => api.get<ShoppingView>("/api/shopping"),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: keys.shopping });
    for (const key of stockWriteInvalidates) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const add = useMutation({
    mutationFn: (freeText: string) => api.post("/api/shopping", { freeText }),
    onSuccess: () => {
      setText("");
      invalidate();
    },
  });

  const check = useMutation({
    mutationFn: (row: RevivedShoppingRow) =>
      api.post(`/api/shopping/${row.id}/${row.isChecked ? "uncheck" : "check"}`),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/shopping/${id}`),
    onSuccess: invalidate,
  });

  if (list.isPending) return <Spinner />;
  if (list.isError) return <ErrorNote error={list.error} />;
  if (!list.data) return null;

  // `groupShoppingRows` does the archived split itself — Feature 14.2 — so it
  // gets every row, not a pre-filtered list.
  const grouped = groupShoppingRows(
    list.data.rows.map(reviveShoppingRow),
    list.data.groups,
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Покупки</h1>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) add.mutate(text.trim());
        }}
        className="flex gap-2"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Додати до списку…"
          className="flex-1"
        />
        <Button type="submit" disabled={add.isPending || !text.trim()}>
          <Plus className="size-4" />
          Додати
        </Button>
      </form>

      <ErrorNote error={add.error ?? check.error ?? remove.error} />

      {grouped.map((group) => (
        <section key={group.id} className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {group.name} ({group.openCount})
          </h2>
          {group.visible.length === 0 ? (
            <EmptyNote>Порожньо.</EmptyNote>
          ) : (
            <ul className="space-y-2">
              {group.visible.map((row) => (
                <li key={row.id}>
                  <Card size="sm">
                    <CardContent className="flex items-center justify-between gap-3">
                      <label className="flex flex-1 items-center gap-3">
                        <input
                          type="checkbox"
                          checked={row.isChecked}
                          onChange={() => check.mutate(row)}
                          className="size-4 accent-primary"
                        />
                        <span
                          className={cn(
                            "text-sm",
                            row.isChecked && "text-muted-foreground line-through",
                          )}
                        >
                          {row.item?.name ?? row.freeText}
                          {row.note ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {row.note}
                            </span>
                          ) : null}
                        </span>
                      </label>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Прибрати"
                        onClick={() => remove.mutate(row.id)}
                      >
                        <X className="size-4" />
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {list.data.candidates.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Варто купити ({list.data.candidates.length})
          </h2>
          {/* Feature 6 — suggestions, never auto-inserted. A list that fills
              itself stops being read. */}
          <ul className="space-y-2">
            {list.data.candidates.map((candidate) => (
              <li key={candidate.name}>
                <Card size="sm">
                  <CardContent className="flex items-center justify-between gap-3">
                    <span className="text-sm">{candidate.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => add.mutate(candidate.name)}
                    >
                      додати?
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
