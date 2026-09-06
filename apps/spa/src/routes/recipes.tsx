import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, type ApiError } from "../api/client";
import { keys } from "../api/keys";
import type { Household } from "../api/types";
import { formatUsd } from "@supplies/core/format";
import { Button, Card, ErrorNote, Spinner } from "../components/ui";

type RecipeSuggestion = {
  text: string;
  usage: { input: number; output: number };
  costUsd: number | null;
};

/**
 * Feature 32 — «Рецепти».
 *
 * Nothing is asked of the model until someone presses the button. Every render
 * would otherwise be a charge, and a suggestion nobody asked for is not worth
 * paying for.
 *
 * The tab is hidden when the household has the helper switched off, but this
 * page still checks — and so does the API, which is the one that matters. A
 * hidden link is not an access control.
 */
export function RecipesRoute() {
  const household = useQuery({
    queryKey: keys.household,
    queryFn: () => api.get<Household>("/api/household"),
  });

  const suggest = useMutation({
    mutationFn: () => api.post<RecipeSuggestion>("/api/recipes/suggest"),
  });

  if (household.isPending) return <Spinner />;

  if (!household.data?.aiEnabled) {
    return (
      <Card className="space-y-2">
        <p className="text-sm">Помічник зі стравами вимкнено.</p>
        <p className="text-sm text-neutral-500">
          Увімкніть його в{" "}
          <Link to="/settings" className="text-emerald-700 hover:underline">
            налаштуваннях
          </Link>
          .
        </p>
      </Card>
    );
  }

  const rateLimited = (suggest.error as ApiError | null)?.key === "error.rateLimited";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Рецепти</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Одна страва з того, що є вдома. Прострочене не пропонується.
        </p>
      </div>

      <Button onClick={() => suggest.mutate()} disabled={suggest.isPending}>
        {suggest.isPending ? "Думаємо…" : "Що приготувати?"}
      </Button>

      {rateLimited ? (
        <p className="text-sm text-amber-700">
          Забагато запитів поспіль — спробуйте за хвилину.
        </p>
      ) : (
        <ErrorNote error={suggest.error} />
      )}

      {suggest.data ? (
        <Card className="space-y-3">
          {/* The model's own layout, kept as it came. A recipe is prose with a
              shape, and every parser for that shape is wrong eventually. */}
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {suggest.data.text}
          </p>
          <p className="text-xs text-neutral-500">
            Надіслано {suggest.data.usage.input} токенів (ваш список), отримано{" "}
            {suggest.data.usage.output} (рецепт)
            {suggest.data.costUsd !== null
              ? ` · приблизно ${formatUsd(suggest.data.costUsd)}`
              : null}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
