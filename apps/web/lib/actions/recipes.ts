"use server";

import { requireSession } from "@/lib/auth-guard";
import type { ActionResult } from "@supplies/core/action-result";
import { suggestRecipe, type RecipeSuggestion } from "@supplies/db/recipes-service";

/**
 * Session guard only. Feature 32's two refusals — the household switch and the
 * almost-empty pantry — live in `@supplies/db/recipes-service`, because they
 * are what stops the button spending money and every client needs them.
 */
export type { RecipeSuggestion };

export async function suggestRecipeAction(): Promise<ActionResult<RecipeSuggestion>> {
  const session = await requireSession();
  return suggestRecipe(session);
}
