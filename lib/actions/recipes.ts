"use server";

import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { ruleMessage } from "@/lib/messages";
import { getHousehold, getItemViews } from "@/lib/queries";
import { askClaude } from "@/lib/claude";
import {
  MIN_PANTRY_LINES,
  RECIPE_SYSTEM_PROMPT,
  buildRecipePrompt,
  estimateCostUsd,
  pantryLines,
} from "@/lib/recipes";
import { todayUTC } from "@/lib/period";

/**
 * Feature 32 — ask Claude what to cook from what the household actually has.
 *
 * A server action, so the API key stays on the server. It never reaches the
 * browser and is never a public route: the only way to spend money here is to
 * be signed in to this household and press the button.
 *
 * Reads through `getItemViews` like every other screen, so "what we have" means
 * exactly what the items list means — stock summed from live batches, expiry
 * resolved through the category window. A second notion of the pantry is the
 * one thing this feature must not introduce.
 */
export type RecipeSuggestion = {
  text: string;
  /** Shown so the cost of pressing the button is never a mystery. */
  usage: { input: number; output: number };
  /** Null when the configured model has no price on file — see `estimateCostUsd`. */
  costUsd: number | null;
};

export async function suggestRecipeAction(): Promise<
  ActionResult<RecipeSuggestion>
> {
  const session = await requireSession();

  /**
   * Feature 32.1 — the switch is checked HERE, not only in the navigation.
   * A hidden link is not an access control: this action is reachable by anyone
   * signed in to the household, and it is the thing that spends money.
   */
  const household = await getHousehold(session.householdId);
  if (!household.aiEnabled) return actionError(ruleMessage("recipe.disabled"));

  const lines = pantryLines(await getItemViews(session.householdId));

  /**
   * Refuse before spending anything. An almost-empty pantry cannot produce a
   * useful answer, and paying a model to say so is worse than saying it here.
   */
  if (lines.length < MIN_PANTRY_LINES) {
    return actionError(ruleMessage("recipe.notEnoughFood"));
  }

  const result = await askClaude(
    RECIPE_SYSTEM_PROMPT,
    buildRecipePrompt(lines, todayUTC()),
  );
  if (!result.ok) return actionError(result.error);

  return actionOk({
    text: result.text,
    usage: result.usage,
    costUsd: estimateCostUsd(result.model, result.usage),
  });
}
