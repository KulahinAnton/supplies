import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys, stockWriteInvalidates } from "../api/keys";
import {
  reviveShoppingRow,
  type RevivedShoppingRow,
  type ShoppingView,
} from "../api/types";
import { groupShoppingRows } from "@supplies/core/shopping-groups";
import { Button, Card, ErrorNote, Spinner } from "../components/ui";

/**
 * «Список покупок».
 *
 * The grouping is `groupRows` from `@supplies/core/shopping-groups` — the same
 * pure function the Next app uses — and that matters more than it looks.
 * Feature 11's «Загальна група» is not a row in the database; it is
 * `groupId = null`. Regrouping by hand here would be a second implementation
 * of a rule whose only interesting case is the one that has no row.
 *
 * Ticking a row is a stock-in for item rows (Feature 6), which is why checking
 * invalidates the stock keys and not just the list.
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
      api.post(`/api/shopping/${row.id}/${row.isChecked ? "uncheck" : "check"}`, {}),
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) add.mutate(text.trim());
        }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Додати до списку…"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={add.isPending || !text.trim()}>
          Додати
        </Button>
      </form>

      <ErrorNote error={add.error ?? check.error ?? remove.error} />

      {grouped.map((group) => (
        <section key={group.id} className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-500">
            {group.name} ({group.openCount})
          </h2>
          {group.visible.length === 0 ? (
            <p className="text-sm text-neutral-400">Порожньо.</p>
          ) : (
            <ul className="space-y-2">
              {group.visible.map((row) => (
                <li key={row.id}>
                  <Card className="flex items-center justify-between gap-3 py-2">
                    <label className="flex flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={row.isChecked}
                        onChange={() => check.mutate(row)}
                        className="size-4"
                      />
                      <span className={row.isChecked ? "text-neutral-400 line-through" : ""}>
                        {row.item?.name ?? row.freeText}
                        {row.note ? (
                          <span className="ml-2 text-xs text-neutral-500">{row.note}</span>
                        ) : null}
                      </span>
                    </label>
                    <Button variant="ghost" onClick={() => remove.mutate(row.id)}>
                      ✕
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {list.data.candidates.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-500">
            Варто купити ({list.data.candidates.length})
          </h2>
          {/* Feature 6 — suggestions, never auto-inserted. A list that fills
              itself stops being read. */}
          <ul className="space-y-2">
            {list.data.candidates.map((candidate) => (
              <li key={candidate.name}>
                <Card className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm">{candidate.name}</span>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      add.mutate(candidate.itemId ? candidate.name : candidate.name)
                    }
                  >
                    додати?
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
