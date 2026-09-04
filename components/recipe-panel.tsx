"use client";

import { useState } from "react";
import { ChefHat, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatUsd } from "@supplies/core/format";
import { renderMessage } from "@supplies/core/messages";
import { suggestRecipeAction, type RecipeSuggestion } from "@/lib/actions/recipes";

/**
 * Feature 32 — the button, and whatever came back.
 *
 * The suggestion is rendered as the plain text the model produced, not parsed
 * into fields. A recipe is prose with a shape, and every parser for that shape
 * is one wording change away from showing nothing — the model is asked for a
 * fixed layout and the layout is preserved rather than dismantled.
 *
 * Nothing is stored. Pressing again asks again; the previous suggestion is
 * simply replaced. Keeping a history would mean a table, a page, and a decision
 * about whose suggestions those are — none of which was asked for.
 */
export function RecipePanel() {
  const [suggestion, setSuggestion] = useState<RecipeSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function ask() {
    setPending(true);
    setError(null);

    const result = await suggestRecipeAction();
    setPending(false);

    if (!result.ok) {
      setError(renderMessage(result.error));
      return;
    }
    setSuggestion(result.data);
  }

  return (
    <div className="space-y-4">
      <Button className="w-full sm:w-auto" disabled={pending} onClick={ask}>
        <Sparkles className={pending ? "size-4 animate-pulse" : "size-4"} />
        {pending
          ? "Думаємо…"
          : suggestion
            ? "Запропонувати іншу"
            : "Що приготувати сьогодні?"}
      </Button>

      {error ? (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {suggestion ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ChefHat className="size-4" />
              <span className="text-xs">Пропозиція на сьогодні</span>
            </div>

            {/* The model's own layout, kept as it came. */}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {suggestion.text}
            </p>

            {/* Two bare numbers invited exactly one question — is that a
                lot? — so the answer is on the line with them. */}
            <p className="text-xs text-muted-foreground">
              Надіслано {suggestion.usage.input} токенів (ваш список),
              отримано {suggestion.usage.output} (рецепт)
              {suggestion.costUsd !== null
                ? ` · приблизно ${formatUsd(suggestion.costUsd)}`
                : null}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
