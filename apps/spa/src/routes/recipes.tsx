import { useMutation, useQuery } from "@tanstack/react-query";
import { ChefHat } from "lucide-react";
import { Link } from "react-router";
import { formatUsd } from "@supplies/core/format";
import { Button } from "@supplies/ui/button";
import { Card, CardContent } from "@supplies/ui/card";
import { api, type ApiError } from "../api/client";
import { keys } from "../api/keys";
import type { Household } from "../api/types";
import { ErrorNote, Spinner } from "../components/feedback";

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
      <Card>
        <CardContent className="space-y-2">
          <p className="text-sm">Помічник зі стравами вимкнено.</p>
          <p className="text-sm text-muted-foreground">
            Увімкніть його в{" "}
            <Link to="/settings" className="text-primary hover:underline">
              налаштуваннях
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  const rateLimited = (suggest.error as ApiError | null)?.key === "error.rateLimited";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Рецепти</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Одна страва з того, що є вдома. Прострочене не пропонується.
        </p>
      </div>

      <Button onClick={() => suggest.mutate()} disabled={suggest.isPending}>
        <ChefHat className="size-4" />
        {suggest.isPending ? "Думаємо…" : "Що приготувати?"}
      </Button>

      {rateLimited ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground dark:text-warning">
          Забагато запитів поспіль — спробуйте за хвилину.
        </p>
      ) : (
        <ErrorNote error={suggest.error} />
      )}

      {suggest.data ? (
        <Card>
          <CardContent className="space-y-3">
            {/* The model's own layout, kept as it came. A recipe is prose with
                a shape, and every parser for that shape is wrong eventually. */}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {suggest.data.text}
            </p>
            <p className="text-xs text-muted-foreground">
              Надіслано {suggest.data.usage.input} токенів (ваш список), отримано{" "}
              {suggest.data.usage.output} (рецепт)
              {suggest.data.costUsd !== null
                ? ` · приблизно ${formatUsd(suggest.data.costUsd)}`
                : null}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
